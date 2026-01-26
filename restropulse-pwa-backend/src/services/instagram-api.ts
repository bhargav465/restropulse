/**
 * Instagram Graph API Service
 * Handles OAuth flow, token management, and API calls to Instagram/Meta
 */

import axios, { AxiosError } from 'axios';
import { generateStateToken, encrypt, decrypt } from './encryption.js';

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
    'pages_read_engagement',
    'public_profile'
].join(',');

// In-memory store for OAuth state tokens (use Redis in production)
const stateTokenStore = new Map<string, { createdAt: number; restaurantId: string }>();
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
 * Clean up expired state tokens
 */
function cleanupExpiredStateTokens(): void {
    const now = Date.now();
    for (const [token, data] of stateTokenStore.entries()) {
        if (now - data.createdAt > STATE_TOKEN_EXPIRY_MS) {
            stateTokenStore.delete(token);
        }
    }
}

/**
 * Generate OAuth URL with CSRF protection
 * Uses Business Login for Instagram with extras parameter for simplified onboarding
 * See: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/business-login-for-instagram
 */
export function generateOAuthUrl(restaurantId: string): { url: string; state: string } {
    // Cleanup old tokens first
    cleanupExpiredStateTokens();

    const state = generateStateToken();
    stateTokenStore.set(state, { createdAt: Date.now(), restaurantId });

    // extras parameter enables Business Login for Instagram onboarding flow
    // This allows users to set up their Instagram Business account during OAuth
    const extras = JSON.stringify({
        setup: {
            channel: 'IG_API_ONBOARDING'
        }
    });

    const params = new URLSearchParams({
        client_id: INSTAGRAM_APP_ID,
        redirect_uri: INSTAGRAM_REDIRECT_URI,
        scope: OAUTH_SCOPES,
        response_type: 'code',
        state: state,
        extras: extras
    });

    return {
        url: `${META_OAUTH_URL}?${params.toString()}`,
        state
    };
}

/**
 * Validate state token and return associated restaurant ID
 */
export function validateStateToken(state: string): { valid: boolean; restaurantId?: string } {
    const data = stateTokenStore.get(state);

    if (!data) {
        return { valid: false };
    }

    // Check expiry
    if (Date.now() - data.createdAt > STATE_TOKEN_EXPIRY_MS) {
        stateTokenStore.delete(state);
        return { valid: false };
    }

    // Remove token after validation (one-time use)
    stateTokenStore.delete(state);

    return { valid: true, restaurantId: data.restaurantId };
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
    try {
        const response = await metaApi.get('/oauth/access_token', {
            params: {
                client_id: INSTAGRAM_APP_ID,
                client_secret: INSTAGRAM_APP_SECRET,
                redirect_uri: INSTAGRAM_REDIRECT_URI,
                code: code
            }
        });

        // Exchange short-lived token for long-lived token
        const shortLivedToken = response.data.access_token;

        const longLivedResponse = await metaApi.get('/oauth/access_token', {
            params: {
                grant_type: 'fb_exchange_token',
                client_id: INSTAGRAM_APP_ID,
                client_secret: INSTAGRAM_APP_SECRET,
                fb_exchange_token: shortLivedToken
            }
        });

        return {
            accessToken: longLivedResponse.data.access_token,
            expiresIn: longLivedResponse.data.expires_in || 5184000 // Default 60 days
        };
    } catch (error) {
        console.error('Token exchange error:', error instanceof AxiosError ? error.response?.data : error);
        return null;
    }
}

/**
 * Fetch user's managed Facebook Pages
 */
async function getUserPages(accessToken: string): Promise<Array<{ id: string; name: string; access_token: string }>> {
    try {
        const response = await metaApi.get('/me/accounts', {
            params: {
                access_token: accessToken,
                fields: 'id,name,access_token'
            }
        });

        return response.data.data || [];
    } catch (error) {
        const parsed = parseMetaApiError(error);
        console.error('Get pages error:', parsed.message, parsed.code ? `(code: ${parsed.code})` : '');
        return [];
    }
}

/**
 * Get Instagram Business Account linked to a Facebook Page
 */
async function getInstagramBusinessAccount(pageId: string, pageAccessToken: string): Promise<InstagramAccount | null> {
    try {
        // Get Instagram Business Account ID linked to the page
        const pageResponse = await metaApi.get(`/${pageId}`, {
            params: {
                access_token: pageAccessToken,
                fields: 'instagram_business_account,name'
            }
        });

        const igAccountId = pageResponse.data.instagram_business_account?.id;
        const pageName = pageResponse.data.name;

        if (!igAccountId) {
            return null;
        }

        // Get Instagram account details
        const igResponse = await metaApi.get(`/${igAccountId}`, {
            params: {
                access_token: pageAccessToken,
                fields: 'id,username,name,profile_picture_url'
            }
        });

        return {
            id: igResponse.data.id,
            username: igResponse.data.username,
            name: igResponse.data.name,
            profilePictureUrl: igResponse.data.profile_picture_url,
            pageId: pageId,
            pageName: pageName
        };
    } catch (error) {
        const parsed = parseMetaApiError(error);
        console.error('Get IG account error:', parsed.message, parsed.code ? `(code: ${parsed.code})` : '');
        return null;
    }
}

/**
 * Validate Instagram permissions
 */
async function validatePermissions(accessToken: string): Promise<boolean> {
    try {
        const response = await metaApi.get('/me/permissions', {
            params: { access_token: accessToken }
        });

        const grantedPermissions = response.data.data
            .filter((p: any) => p.status === 'granted')
            .map((p: any) => p.permission);

        const requiredPermissions = ['instagram_basic', 'pages_show_list', 'pages_read_engagement'];
        return requiredPermissions.every(p => grantedPermissions.includes(p));
    } catch (error) {
        const parsed = parseMetaApiError(error);
        console.error('Permission validation error:', parsed.message);
        return false;
    }
}

/**
 * Main OAuth callback handler - runs the validation pipeline
 * Steps A-B-C-D from the integration spec
 */
export async function handleOAuthCallback(code: string, state: string): Promise<InstagramConnectionResult> {
    // Validate configuration before proceeding
    if (!isInstagramConfigured()) {
        return {
            success: false,
            error: 'CONFIG_ERROR',
            errorMessage: 'Instagram integration is not properly configured. Please contact support.'
        };
    }

    // Validate state token (CSRF protection)
    const stateValidation = validateStateToken(state);
    if (!stateValidation.valid) {
        return {
            success: false,
            error: 'INVALID_STATE',
            errorMessage: 'Invalid or expired authorization request. Please try again.'
        };
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

    for (const page of pages) {
        const igAccount = await getInstagramBusinessAccount(page.id, page.access_token);
        if (igAccount) {
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
        return {
            success: true,
            account: instagramAccounts[0],
            accessToken: tokenResult.accessToken,
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
