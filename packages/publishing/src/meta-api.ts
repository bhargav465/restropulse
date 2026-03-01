/**
 * Meta API Service
 * Handles OAuth flow, token management, and API calls to Instagram/Meta
 */

import axios, { AxiosError } from 'axios';
import { generateStateToken, encrypt, decrypt } from './encryption.js';
import { getOauthSessionsCollection } from '@restropulse/db';

// Instagram OAuth Configuration
const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID || '';
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET || '';
const INSTAGRAM_REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI || 'http://localhost:3001/api/integrations/instagram/callback';

// API Endpoints
const META_OAUTH_URL = 'https://www.facebook.com/v18.0/dialog/oauth';
const META_GRAPH_API = 'https://graph.facebook.com/v18.0';

// Request timeout (30 seconds)
const API_TIMEOUT_MS = 30000;

// Create axios instance with defaults
const metaApi = axios.create({
    baseURL: META_GRAPH_API,
    timeout: API_TIMEOUT_MS
});

// Required OAuth Scopes for Instagram Business
const OAUTH_SCOPES = [
    'instagram_basic',
    'instagram_content_publish',
    'pages_show_list',
    'pages_read_user_content',
    'pages_manage_posts',  // Required for uploading photos to Facebook Page (CDN upload)
    'public_profile'
].join(',');

const STATE_TOKEN_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

// Error types for validation pipeline
export type InstagramConnectionError =
    | 'NO_PAGES_FOUND'
    | 'NO_IG_ACCOUNT_FOUND'
    | 'PERMISSIONS_MISSING'
    | 'INVALID_STATE'
    | 'TOKEN_EXCHANGE_FAILED'
    | 'API_ERROR'
    | 'ACCOUNT_TYPE_MISMATCH'
    | 'RATE_LIMITED'
    | 'CONFIG_ERROR'
    | 'TIMEOUT';

export interface InstagramAccount {
    id: string;
    username: string;
    name?: string;
    profilePictureUrl?: string;
    pageId: string;
    pageName: string;
    pageAccessToken?: string; // Page token needed for Content Publishing API
}

export interface InstagramConnectionResult {
    success: boolean;
    error?: InstagramConnectionError;
    errorMessage?: string;
    account?: InstagramAccount;
    accounts?: InstagramAccount[]; // Multiple accounts for picker
    accessToken?: string;
    tokenExpiresAt?: Date;
}

export interface StoredInstagramCredentials {
    userId: string;
    username: string;
    pageId: string;
    pageName: string;
    accessToken: string; // Encrypted
    tokenExpiresAt: Date;
    scopes: string[];
    connectedAt: Date;
    lastRefreshedAt?: Date;
}

/**
 * Generate OAuth URL with CSRF protection
 * Uses Business Login for Instagram with extras parameter for simplified onboarding
 * See: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/business-login-for-instagram
 */
export async function generateOAuthUrl(restaurantId: string, useOnboarding: boolean = false): Promise<{ url: string; state: string }> {
    const state = generateStateToken();
    const expiresAt = new Date(Date.now() + STATE_TOKEN_EXPIRY_MS);
    const col = getOauthSessionsCollection();
    await col.insertOne({ type: 'oauth_state', state, restaurantId, expiresAt });

    const params = new URLSearchParams({
        client_id: INSTAGRAM_APP_ID,
        redirect_uri: INSTAGRAM_REDIRECT_URI,
        scope: OAUTH_SCOPES,
        response_type: 'code',
        state: state
    });

    // IG_API_ONBOARDING is for users who need to set up their Instagram Business account
    // Standard OAuth (without extras) works better for users who already have everything configured
    if (useOnboarding) {
        const extras = JSON.stringify({
            setup: {
                channel: 'IG_API_ONBOARDING'
            }
        });
        params.append('extras', extras);
        console.log('[OAuth] Using IG_API_ONBOARDING flow for guided setup');
    } else {
        console.log('[OAuth] Using standard OAuth flow');
    }

    return {
        url: `${META_OAUTH_URL}?${params.toString()}`,
        state
    };
}

/**
 * Validate state token and return associated restaurant ID
 * One-time use: findOneAndDelete removes the token atomically
 */
export async function validateStateToken(state: string): Promise<{ valid: boolean; restaurantId?: string }> {
    const col = getOauthSessionsCollection();
    const doc = await col.findOneAndDelete({ type: 'oauth_state', state }) as any;

    if (!doc) {
        return { valid: false };
    }

    // Check expiry (TTL index handles background cleanup; check here for immediate validation)
    if (new Date() > new Date(doc.expiresAt)) {
        return { valid: false };
    }

    return { valid: true, restaurantId: doc.restaurantId };
}

/**
 * Parse Meta API error for better error messages
 */
function parseMetaApiError(error: unknown): { code: number | null; message: string; isRateLimit: boolean; isTimeout: boolean } {
    if (error instanceof AxiosError) {
        // Timeout error
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            return { code: null, message: 'Request timed out', isRateLimit: false, isTimeout: true };
        }

        const metaError = error.response?.data?.error;
        if (metaError) {
            // Meta rate limit codes: 4 (app-level), 17 (user-level), 32 (page-level)
            const isRateLimit = [4, 17, 32].includes(metaError.code);
            return {
                code: metaError.code,
                message: metaError.message || 'Unknown Meta API error',
                isRateLimit,
                isTimeout: false
            };
        }

        return {
            code: error.response?.status || null,
            message: error.message,
            isRateLimit: error.response?.status === 429,
            isTimeout: false
        };
    }

    return { code: null, message: String(error), isRateLimit: false, isTimeout: false };
}

/**
 * Exchange authorization code for access token
 */
async function exchangeCodeForToken(code: string): Promise<{ accessToken: string; expiresIn: number } | null> {
    console.log('[OAuth] Step 1: Exchanging code for short-lived token...');
    try {
        const response = await metaApi.get('/oauth/access_token', {
            params: {
                client_id: INSTAGRAM_APP_ID,
                client_secret: INSTAGRAM_APP_SECRET,
                redirect_uri: INSTAGRAM_REDIRECT_URI,
                code: code
            }
        });
        console.log('[OAuth] Step 1 SUCCESS: Got short-lived token');

        // Exchange short-lived token for long-lived token
        const shortLivedToken = response.data.access_token;
        console.log('[OAuth] Step 2: Exchanging for long-lived token...');

        const longLivedResponse = await metaApi.get('/oauth/access_token', {
            params: {
                grant_type: 'fb_exchange_token',
                client_id: INSTAGRAM_APP_ID,
                client_secret: INSTAGRAM_APP_SECRET,
                fb_exchange_token: shortLivedToken
            }
        });
        console.log('[OAuth] Step 2 SUCCESS: Got long-lived token, expires in', longLivedResponse.data.expires_in, 'seconds');

        return {
            accessToken: longLivedResponse.data.access_token,
            expiresIn: longLivedResponse.data.expires_in || 5184000 // Default 60 days
        };
    } catch (error) {
        console.error('[OAuth] Token exchange FAILED:', error instanceof AxiosError ? error.response?.data : error);
        return null;
    }
}

/**
 * Fetch user's managed Facebook Pages
 */
async function getUserPages(accessToken: string): Promise<Array<{ id: string; name: string; access_token: string }>> {
    console.log('[OAuth] Step 3: Fetching Facebook Pages...');

    // First, let's see who we're authenticated as
    try {
        const meResponse = await metaApi.get('/me', {
            params: {
                access_token: accessToken,
                fields: 'id,name,email'
            }
        });
        console.log('[OAuth] Authenticated as:', JSON.stringify(meResponse.data, null, 2));
    } catch (err) {
        console.error('[OAuth] Failed to get /me:', err);
    }

    // Debug: Check token info and extract granular_scopes
    let granularPageIds: string[] = [];
    let granularIgIds: string[] = [];

    try {
        const debugResponse = await metaApi.get('/debug_token', {
            params: {
                input_token: accessToken,
                access_token: `${INSTAGRAM_APP_ID}|${INSTAGRAM_APP_SECRET}`
            }
        });
        console.log('[OAuth] Token debug info:', JSON.stringify(debugResponse.data, null, 2));

        // Extract page IDs from granular_scopes (fallback for Development mode)
        const granularScopes = debugResponse.data.data?.granular_scopes || [];
        const pageIdSet = new Set<string>();
        const igIdSet = new Set<string>();

        for (const scope of granularScopes) {
            if (scope.scope === 'pages_show_list' || scope.scope === 'pages_read_user_content') {
                (scope.target_ids || []).forEach((id: string) => pageIdSet.add(id));
            }
            if (scope.scope === 'instagram_basic') {
                (scope.target_ids || []).forEach((id: string) => igIdSet.add(id));
            }
        }

        granularPageIds = Array.from(pageIdSet);
        granularIgIds = Array.from(igIdSet);
        console.log('[OAuth] Extracted from granular_scopes - Page IDs:', granularPageIds, 'IG IDs:', granularIgIds);
    } catch (err) {
        console.log('[OAuth] Could not get token debug info');
    }

    try {
        // Try /me/accounts first (standard approach)
        console.log('[OAuth] Step 3a: Trying /me/accounts...');
        const response = await metaApi.get('/me/accounts', {
            params: {
                access_token: accessToken,
                fields: 'id,name,access_token,instagram_business_account'
            }
        });

        let pages = response.data.data || [];
        console.log('[OAuth] Step 3a Response - /me/accounts:', JSON.stringify(response.data, null, 2));

        // If empty, try alternative endpoint with nested fields
        if (pages.length === 0) {
            console.log('[OAuth] Step 3b: /me/accounts empty, trying /me?fields=accounts...');
            const altResponse = await metaApi.get('/me', {
                params: {
                    access_token: accessToken,
                    fields: 'accounts{id,name,access_token,instagram_business_account}'
                }
            });
            console.log('[OAuth] Step 3b Response - /me?fields=accounts:', JSON.stringify(altResponse.data, null, 2));
            pages = altResponse.data.accounts?.data || [];
        }

        // If still empty, check business accounts
        if (pages.length === 0) {
            console.log('[OAuth] Step 3c: Still empty, trying /me/businesses...');
            try {
                const bizResponse = await metaApi.get('/me/businesses', {
                    params: {
                        access_token: accessToken,
                        fields: 'id,name,owned_pages{id,name,access_token}'
                    }
                });
                console.log('[OAuth] Step 3c Response - /me/businesses:', JSON.stringify(bizResponse.data, null, 2));

                // Extract pages from businesses
                const businesses = bizResponse.data.data || [];
                for (const biz of businesses) {
                    const bizPages = biz.owned_pages?.data || [];
                    pages.push(...bizPages);
                }
            } catch (bizErr) {
                console.log('[OAuth] Step 3c: /me/businesses failed (might need business_management permission)');
            }
        }

        // FALLBACK: If still empty but we have page IDs from granular_scopes, fetch them directly
        // This handles a Meta bug in Development mode where /me/accounts returns empty
        // even though the user granted page permissions
        if (pages.length === 0 && granularPageIds.length > 0) {
            console.log('[OAuth] Step 3d: Using granular_scopes fallback - fetching pages directly by ID...');

            for (const pageId of granularPageIds) {
                try {
                    // Fetch page details directly - we need a page access token
                    // First, try to get page access token through the page endpoint
                    const pageResponse = await metaApi.get(`/${pageId}`, {
                        params: {
                            access_token: accessToken,
                            fields: 'id,name,access_token,instagram_business_account'
                        }
                    });
                    console.log(`[OAuth] Step 3d: Fetched page ${pageId}:`, JSON.stringify(pageResponse.data, null, 2));

                    if (pageResponse.data.id) {
                        pages.push({
                            id: pageResponse.data.id,
                            name: pageResponse.data.name || 'Unknown Page',
                            access_token: pageResponse.data.access_token || accessToken, // Use page token or user token
                            instagram_business_account: pageResponse.data.instagram_business_account
                        });
                    }
                } catch (pageErr) {
                    console.log(`[OAuth] Step 3d: Could not fetch page ${pageId}:`, pageErr instanceof Error ? pageErr.message : pageErr);
                }
            }
        }

        console.log('[OAuth] Step 3 FINAL RESULT: Found', pages.length, 'pages:', pages.map((p: any) => ({ id: p.id, name: p.name })));
        return pages;
    } catch (error) {
        const parsed = parseMetaApiError(error);
        console.error('[OAuth] Step 3 FAILED - Get pages error:', parsed.message, parsed.code ? `(code: ${parsed.code})` : '');
        if (error instanceof AxiosError) {
            console.error('[OAuth] Full error response:', JSON.stringify(error.response?.data, null, 2));
        }
        return [];
    }
}

/**
 * Get Instagram Business Account linked to a Facebook Page
 */
async function getInstagramBusinessAccount(pageId: string, pageAccessToken: string): Promise<InstagramAccount | null> {
    try {
        // Get Instagram Business Account ID linked to the page
        console.log('[OAuth] Step 4b: Fetching IG account for page', pageId);
        const pageResponse = await metaApi.get(`/${pageId}`, {
            params: {
                access_token: pageAccessToken,
                fields: 'instagram_business_account,name'
            }
        });
        console.log('[OAuth] Page response:', JSON.stringify(pageResponse.data, null, 2));

        const igAccountId = pageResponse.data.instagram_business_account?.id;
        const pageName = pageResponse.data.name;

        if (!igAccountId) {
            console.log('[OAuth] No Instagram Business Account linked to page', pageName);
            return null;
        }
        console.log('[OAuth] Found IG account ID:', igAccountId, 'for page:', pageName);

        // Get Instagram account details
        console.log('[OAuth] Step 4c: Fetching IG account details...');
        const igResponse = await metaApi.get(`/${igAccountId}`, {
            params: {
                access_token: pageAccessToken,
                fields: 'id,username,name,profile_picture_url'
            }
        });
        console.log('[OAuth] IG account details:', JSON.stringify(igResponse.data, null, 2));

        return {
            id: igResponse.data.id,
            username: igResponse.data.username,
            name: igResponse.data.name,
            profilePictureUrl: igResponse.data.profile_picture_url,
            pageId: pageId,
            pageName: pageName,
            pageAccessToken: pageAccessToken // Carry the page token for publishing
        };
    } catch (error) {
        const parsed = parseMetaApiError(error);
        console.error('[OAuth] Get IG account FAILED:', parsed.message, parsed.code ? `(code: ${parsed.code})` : '');
        if (error instanceof AxiosError) {
            console.error('[OAuth] Full error:', JSON.stringify(error.response?.data, null, 2));
        }
        return null;
    }
}

/**
 * Validate Instagram permissions
 */
async function validatePermissions(accessToken: string): Promise<boolean> {
    console.log('[OAuth] Checking granted permissions...');
    try {
        const response = await metaApi.get('/me/permissions', {
            params: { access_token: accessToken }
        });

        console.log('[OAuth] All permissions:', JSON.stringify(response.data.data, null, 2));

        const grantedPermissions = response.data.data
            .filter((p: any) => p.status === 'granted')
            .map((p: any) => p.permission);

        console.log('[OAuth] Granted permissions:', grantedPermissions);

        // Only require the essential permissions
        const requiredPermissions = ['instagram_basic', 'pages_show_list'];
        const hasAll = requiredPermissions.every(p => grantedPermissions.includes(p));
        console.log('[OAuth] Required permissions:', requiredPermissions, '| Has all:', hasAll);

        return hasAll;
    } catch (error) {
        const parsed = parseMetaApiError(error);
        console.error('[OAuth] Permission validation FAILED:', parsed.message);
        return false;
    }
}

/**
 * Main OAuth callback handler - runs the validation pipeline
 * Steps A-B-C-D from the integration spec
 * @param skipStateValidation - Set to true if state was already validated by caller
 */
export async function handleOAuthCallback(code: string, state: string, skipStateValidation = false): Promise<InstagramConnectionResult> {
    // Validate configuration before proceeding
    if (!isInstagramConfigured()) {
        return {
            success: false,
            error: 'CONFIG_ERROR',
            errorMessage: 'Instagram integration is not properly configured. Please contact support.'
        };
    }

    // Validate state token (CSRF protection) - skip if already validated by caller
    if (!skipStateValidation) {
        const stateValidation = await validateStateToken(state);
        if (!stateValidation.valid) {
            return {
                success: false,
                error: 'INVALID_STATE',
                errorMessage: 'Invalid or expired authorization request. Please try again.'
            };
        }
    }

    // Step A: Exchange code for long-lived token
    const tokenResult = await exchangeCodeForToken(code);
    if (!tokenResult) {
        return {
            success: false,
            error: 'TOKEN_EXCHANGE_FAILED',
            errorMessage: 'Failed to complete authorization. Please try again.'
        };
    }

    // Validate permissions
    const hasPermissions = await validatePermissions(tokenResult.accessToken);
    if (!hasPermissions) {
        return {
            success: false,
            error: 'PERMISSIONS_MISSING',
            errorMessage: 'Please re-authenticate and ensure all checkboxes are checked in the Facebook popup.'
        };
    }

    // Step B: Fetch managed pages
    const pages = await getUserPages(tokenResult.accessToken);
    if (pages.length === 0) {
        return {
            success: false,
            error: 'NO_PAGES_FOUND',
            errorMessage: 'Please ensure you are an Admin of a Facebook Page.'
        };
    }

    // Step C: Find Instagram Business Accounts linked to pages
    const instagramAccounts: InstagramAccount[] = [];
    const seenIgAccountIds = new Set<string>();

    for (const page of pages) {
        const igAccount = await getInstagramBusinessAccount(page.id, page.access_token);
        if (igAccount && !seenIgAccountIds.has(igAccount.id)) {
            seenIgAccountIds.add(igAccount.id);
            instagramAccounts.push(igAccount);
        }
    }

    // Step D: Logic fork
    if (instagramAccounts.length === 0) {
        return {
            success: false,
            error: 'NO_IG_ACCOUNT_FOUND',
            errorMessage: 'Your Instagram is currently a Personal account. Switch to Professional in Instagram Settings to continue.'
        };
    }

    // Calculate token expiry
    const tokenExpiresAt = new Date(Date.now() + tokenResult.expiresIn * 1000);

    // Auto-select if single account, otherwise return list for picker
    if (instagramAccounts.length === 1) {
        // Prefer page access token for Content Publishing API; fall back to user token
        const publishToken = instagramAccounts[0].pageAccessToken || tokenResult.accessToken;
        console.log('[OAuth] Using', instagramAccounts[0].pageAccessToken ? 'page' : 'user', 'access token for publishing');
        return {
            success: true,
            account: instagramAccounts[0],
            accessToken: publishToken,
            tokenExpiresAt
        };
    }

    // Multiple accounts - return list for user selection
    return {
        success: true,
        accounts: instagramAccounts,
        accessToken: tokenResult.accessToken,
        tokenExpiresAt
    };
}

/**
 * Refresh Instagram access token
 * Should be called every 45 days (tokens expire after 60 days)
 */
export async function refreshAccessToken(encryptedToken: string): Promise<{ accessToken: string; expiresAt: Date } | null> {
    try {
        const currentToken = decrypt(encryptedToken);
        if (!currentToken) {
            console.error('Failed to decrypt token for refresh');
            return null;
        }

        const response = await metaApi.get('/oauth/access_token', {
            params: {
                grant_type: 'fb_exchange_token',
                client_id: INSTAGRAM_APP_ID,
                client_secret: INSTAGRAM_APP_SECRET,
                fb_exchange_token: currentToken
            }
        });

        const newToken = response.data.access_token;
        const expiresIn = response.data.expires_in || 5184000; // Default 60 days
        const expiresAt = new Date(Date.now() + expiresIn * 1000);

        return {
            accessToken: newToken,
            expiresAt
        };
    } catch (error) {
        const parsed = parseMetaApiError(error);
        console.error('Token refresh error:', parsed.message, parsed.code ? `(code: ${parsed.code})` : '');
        if (parsed.isRateLimit) {
            console.warn('Rate limited during token refresh - will retry later');
        }
        return null;
    }
}

/**
 * Validate if a token is still valid
 */
export async function validateToken(encryptedToken: string): Promise<boolean> {
    try {
        const token = decrypt(encryptedToken);
        if (!token) return false;

        const response = await metaApi.get('/me', {
            params: { access_token: token }
        });

        return !!response.data.id;
    } catch (error) {
        return false;
    }
}

/**
 * Get Instagram profile info
 */
export async function getInstagramProfile(encryptedToken: string, igUserId: string): Promise<any | null> {
    try {
        const token = decrypt(encryptedToken);
        if (!token) return null;

        const response = await metaApi.get(`/${igUserId}`, {
            params: {
                access_token: token,
                fields: 'id,username,name,profile_picture_url,followers_count,media_count'
            }
        });

        return response.data;
    } catch (error) {
        const parsed = parseMetaApiError(error);
        console.error('Get profile error:', parsed.message);
        return null;
    }
}

/**
 * Prepare credentials for storage (encrypt token)
 */
export function prepareCredentialsForStorage(
    account: InstagramAccount,
    accessToken: string,
    tokenExpiresAt: Date
): StoredInstagramCredentials {
    return {
        userId: account.id,
        username: account.username,
        pageId: account.pageId,
        pageName: account.pageName,
        accessToken: encrypt(accessToken),
        tokenExpiresAt,
        scopes: OAUTH_SCOPES.split(','),
        connectedAt: new Date(),
        lastRefreshedAt: undefined
    };
}

/**
 * Check if Instagram integration is properly configured
 */
export function isInstagramConfigured(): boolean {
    return !!(INSTAGRAM_APP_ID && INSTAGRAM_APP_SECRET && INSTAGRAM_REDIRECT_URI);
}
