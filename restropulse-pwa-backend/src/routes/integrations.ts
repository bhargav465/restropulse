/**
 * Instagram Integration Routes
 * Handles OAuth flow, connection management, and token operations
 */

import express, { Request, Response } from 'express';
import {
    generateOAuthUrl,
    handleOAuthCallback,
    validateStateToken,
    prepareCredentialsForStorage,
    refreshAccessToken,
    validateToken,
    getInstagramProfile,
    isInstagramConfigured,
    InstagramAccount
} from '../services/instagram-api.js';
import { encrypt } from '../services/encryption.js';
import { getRestaurantsCollection, toApiFormat } from '../db/connection.js';
import { checkAndRefreshTokenIfNeeded, triggerManualRefresh } from '../services/token-refresh-cron.js';
import crypto from 'crypto';

const router = express.Router();

// In-memory store for pending OAuth sessions (code -> account selection)
const pendingSelections = new Map<string, {
    accounts: InstagramAccount[];
    accessToken: string;
    tokenExpiresAt: Date;
    restaurantId: string;
    createdAt: number;
}>();

// Cleanup expired pending selections every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, data] of pendingSelections.entries()) {
        if (now - data.createdAt > 10 * 60 * 1000) { // 10 minutes
            pendingSelections.delete(key);
        }
    }
}, 5 * 60 * 1000);

/**
 * GET /api/integrations/instagram/oauth-url
 * Generate OAuth URL for Instagram connection
 */
router.get('/instagram/oauth-url', async (req: Request, res: Response) => {
    try {
        const restaurantId = req.query.restaurantId as string;

        if (!restaurantId) {
            return res.status(400).json({
                success: false,
                error: 'Restaurant ID required'
            });
        }

        if (!isInstagramConfigured()) {
            return res.status(503).json({
                success: false,
                error: 'Instagram integration is not configured. Please contact support.'
            });
        }

        const { url, state } = generateOAuthUrl(restaurantId);

        res.json({
            success: true,
            data: {
                oauthUrl: url,
                state: state
            }
        });
    } catch (error) {
        console.error('OAuth URL generation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate authorization URL'
        });
    }
});

/**
 * GET /api/integrations/instagram/callback
 * OAuth callback handler - processes authorization code
 */
router.get('/instagram/callback', async (req: Request, res: Response) => {
    const { code, state, error: oauthError, error_description } = req.query;

    const frontendCallbackUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    // Handle OAuth errors
    if (oauthError) {
        console.error('OAuth error:', oauthError, error_description);
        return res.redirect(`${frontendCallbackUrl}/auth/instagram/callback?error=oauth_denied&message=${encodeURIComponent(String(error_description || 'Authorization denied'))}`);
    }

    if (!code || !state) {
        return res.redirect(`${frontendCallbackUrl}/auth/instagram/callback?error=missing_params&message=${encodeURIComponent('Missing authorization code or state')}`);
    }

    try {
        // Validate state first to get restaurant ID
        const stateValidation = validateStateToken(String(state));
        if (!stateValidation.valid || !stateValidation.restaurantId) {
            return res.redirect(`${frontendCallbackUrl}/auth/instagram/callback?error=invalid_state&message=${encodeURIComponent('Invalid or expired authorization request. Please try again.')}`);
        }

        const restaurantId = stateValidation.restaurantId;

        // Process OAuth callback
        const result = await handleOAuthCallback(String(code), String(state));

        if (!result.success) {
            return res.redirect(`${frontendCallbackUrl}/auth/instagram/callback?error=${result.error}&message=${encodeURIComponent(result.errorMessage || 'Connection failed')}`);
        }

        // Single account - auto-connect
        if (result.account && result.accessToken) {
            const credentials = prepareCredentialsForStorage(
                result.account,
                result.accessToken,
                result.tokenExpiresAt!
            );

            // Save to database
            const col = getRestaurantsCollection();
            await col.updateOne(
                { _id: restaurantId as any },
                {
                    $set: {
                        'integrations.instagram': true,
                        instagramCredentials: credentials,
                        updatedAt: new Date()
                    }
                }
            );

            return res.redirect(`${frontendCallbackUrl}/auth/instagram/callback?success=true&username=${encodeURIComponent(result.account.username)}`);
        }

        // Multiple accounts - store for selection
        if (result.accounts && result.accounts.length > 1) {
            const selectionId = crypto.randomBytes(16).toString('hex');
            pendingSelections.set(selectionId, {
                accounts: result.accounts,
                accessToken: result.accessToken!,
                tokenExpiresAt: result.tokenExpiresAt!,
                restaurantId,
                createdAt: Date.now()
            });

            return res.redirect(`${frontendCallbackUrl}/auth/instagram/callback?select=true&selectionId=${selectionId}`);
        }

        // Shouldn't reach here
        return res.redirect(`${frontendCallbackUrl}/auth/instagram/callback?error=unknown&message=${encodeURIComponent('Unexpected error occurred')}`);
    } catch (error) {
        console.error('OAuth callback error:', error);
        return res.redirect(`${frontendCallbackUrl}/auth/instagram/callback?error=server_error&message=${encodeURIComponent('Server error during authorization')}`);
    }
});

/**
 * POST /api/integrations/instagram/callback
 * Alternative callback for popup-based flow
 */
router.post('/instagram/callback', async (req: Request, res: Response) => {
    const { code, state } = req.body;

    if (!code || !state) {
        return res.status(400).json({
            success: false,
            error: 'MISSING_PARAMS',
            message: 'Missing authorization code or state'
        });
    }

    try {
        const result = await handleOAuthCallback(code, state);

        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: result.error,
                message: result.errorMessage
            });
        }

        // Single account - return for auto-connect
        if (result.account) {
            return res.json({
                success: true,
                data: {
                    account: result.account,
                    requiresSelection: false
                }
            });
        }

        // Multiple accounts - return list for selection
        if (result.accounts && result.accounts.length > 1) {
            const selectionId = crypto.randomBytes(16).toString('hex');
            const stateData = validateStateToken(state);

            pendingSelections.set(selectionId, {
                accounts: result.accounts,
                accessToken: result.accessToken!,
                tokenExpiresAt: result.tokenExpiresAt!,
                restaurantId: stateData.restaurantId || '',
                createdAt: Date.now()
            });

            return res.json({
                success: true,
                data: {
                    accounts: result.accounts.map(a => ({
                        id: a.id,
                        username: a.username,
                        name: a.name,
                        profilePictureUrl: a.profilePictureUrl,
                        pageName: a.pageName
                    })),
                    selectionId,
                    requiresSelection: true
                }
            });
        }

        return res.status(500).json({
            success: false,
            error: 'UNKNOWN_ERROR',
            message: 'Unexpected response from Instagram'
        });
    } catch (error) {
        console.error('OAuth callback error:', error);
        return res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Server error during authorization'
        });
    }
});

/**
 * GET /api/integrations/instagram/pending-accounts
 * Get accounts from pending selection
 */
router.get('/instagram/pending-accounts/:selectionId', async (req: Request, res: Response) => {
    const { selectionId } = req.params;

    const pending = pendingSelections.get(selectionId);
    if (!pending) {
        return res.status(404).json({
            success: false,
            error: 'Selection session expired or not found'
        });
    }

    res.json({
        success: true,
        data: {
            accounts: pending.accounts.map(a => ({
                id: a.id,
                username: a.username,
                name: a.name,
                profilePictureUrl: a.profilePictureUrl,
                pageName: a.pageName
            }))
        }
    });
});

/**
 * POST /api/integrations/instagram/select-account
 * Complete connection with selected account
 */
router.post('/instagram/select-account', async (req: Request, res: Response) => {
    const { selectionId, accountId } = req.body;

    if (!selectionId || !accountId) {
        return res.status(400).json({
            success: false,
            error: 'Missing selectionId or accountId'
        });
    }

    const pending = pendingSelections.get(selectionId);
    if (!pending) {
        return res.status(404).json({
            success: false,
            error: 'Selection session expired. Please restart the connection process.'
        });
    }

    const selectedAccount = pending.accounts.find(a => a.id === accountId);
    if (!selectedAccount) {
        return res.status(400).json({
            success: false,
            error: 'Invalid account selection'
        });
    }

    try {
        const credentials = prepareCredentialsForStorage(
            selectedAccount,
            pending.accessToken,
            pending.tokenExpiresAt
        );

        // Save to database
        const col = getRestaurantsCollection();
        await col.updateOne(
            { _id: pending.restaurantId as any },
            {
                $set: {
                    'integrations.instagram': true,
                    instagramCredentials: credentials,
                    updatedAt: new Date()
                }
            }
        );

        // Clean up pending selection
        pendingSelections.delete(selectionId);

        res.json({
            success: true,
            data: {
                username: selectedAccount.username,
                message: `Successfully linked to @${selectedAccount.username}!`
            }
        });
    } catch (error) {
        console.error('Account selection error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save connection'
        });
    }
});

/**
 * DELETE /api/integrations/instagram/disconnect/:restaurantId
 * Disconnect Instagram account
 */
router.delete('/instagram/disconnect/:restaurantId', async (req: Request, res: Response) => {
    const { restaurantId } = req.params;

    try {
        const col = getRestaurantsCollection();
        const result = await col.updateOne(
            { _id: restaurantId as any },
            {
                $set: {
                    'integrations.instagram': false,
                    updatedAt: new Date()
                },
                $unset: {
                    instagramCredentials: ''
                }
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Restaurant not found'
            });
        }

        res.json({
            success: true,
            message: 'Instagram disconnected successfully'
        });
    } catch (error) {
        console.error('Disconnect error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to disconnect Instagram'
        });
    }
});

/**
 * GET /api/integrations/instagram/status/:restaurantId
 * Get Instagram connection status (without sensitive token data)
 */
router.get('/instagram/status/:restaurantId', async (req: Request, res: Response) => {
    const { restaurantId } = req.params;

    try {
        const col = getRestaurantsCollection();
        const restaurant = await col.findOne({ _id: restaurantId as any });

        if (!restaurant) {
            return res.status(404).json({
                success: false,
                error: 'Restaurant not found'
            });
        }

        const credentials = restaurant.instagramCredentials;

        if (!credentials || !restaurant.integrations?.instagram) {
            return res.json({
                success: true,
                data: {
                    connected: false
                }
            });
        }

        // Check if token needs refresh
        const tokenExpiresAt = new Date(credentials.tokenExpiresAt);
        const isExpiringSoon = tokenExpiresAt < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const isExpired = tokenExpiresAt < new Date();

        res.json({
            success: true,
            data: {
                connected: true,
                username: credentials.username,
                userId: credentials.userId,
                pageName: credentials.pageName,
                connectedAt: credentials.connectedAt,
                lastRefreshedAt: credentials.lastRefreshedAt,
                tokenExpiresAt: credentials.tokenExpiresAt,
                tokenStatus: isExpired ? 'expired' : isExpiringSoon ? 'expiring_soon' : 'valid',
                needsReauthorization: isExpired
            }
        });
    } catch (error) {
        console.error('Status check error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check connection status'
        });
    }
});

/**
 * POST /api/integrations/instagram/refresh/:restaurantId
 * Manually trigger token refresh
 */
router.post('/instagram/refresh/:restaurantId', async (req: Request, res: Response) => {
    const { restaurantId } = req.params;

    try {
        const success = await checkAndRefreshTokenIfNeeded(restaurantId);

        if (!success) {
            return res.status(400).json({
                success: false,
                error: 'Token refresh failed. Please reconnect your Instagram account.'
            });
        }

        res.json({
            success: true,
            message: 'Token refreshed successfully'
        });
    } catch (error) {
        console.error('Manual refresh error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to refresh token'
        });
    }
});

/**
 * POST /api/integrations/instagram/validate/:restaurantId
 * Validate Instagram connection is still working
 */
router.post('/instagram/validate/:restaurantId', async (req: Request, res: Response) => {
    const { restaurantId } = req.params;

    try {
        const col = getRestaurantsCollection();
        const restaurant = await col.findOne({ _id: restaurantId as any });

        if (!restaurant?.instagramCredentials?.accessToken) {
            return res.status(400).json({
                success: false,
                error: 'No Instagram connection found'
            });
        }

        const isValid = await validateToken(restaurant.instagramCredentials.accessToken);

        if (!isValid) {
            // Mark as needing reauthorization
            await col.updateOne(
                { _id: restaurantId as any },
                {
                    $set: {
                        'integrations.instagram': false,
                        updatedAt: new Date()
                    }
                }
            );

            return res.json({
                success: true,
                data: {
                    valid: false,
                    needsReauthorization: true,
                    message: 'Instagram connection has expired. Please reconnect.'
                }
            });
        }

        res.json({
            success: true,
            data: {
                valid: true,
                needsReauthorization: false
            }
        });
    } catch (error) {
        console.error('Validation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to validate connection'
        });
    }
});

/**
 * GET /api/integrations/instagram/profile/:restaurantId
 * Get Instagram profile info for connected account
 */
router.get('/instagram/profile/:restaurantId', async (req: Request, res: Response) => {
    const { restaurantId } = req.params;

    try {
        // Ensure token is fresh
        await checkAndRefreshTokenIfNeeded(restaurantId);

        const col = getRestaurantsCollection();
        const restaurant = await col.findOne({ _id: restaurantId as any });

        if (!restaurant?.instagramCredentials) {
            return res.status(400).json({
                success: false,
                error: 'No Instagram connection found'
            });
        }

        const profile = await getInstagramProfile(
            restaurant.instagramCredentials.accessToken,
            restaurant.instagramCredentials.userId
        );

        if (!profile) {
            return res.status(400).json({
                success: false,
                error: 'Failed to fetch Instagram profile'
            });
        }

        res.json({
            success: true,
            data: profile
        });
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch profile'
        });
    }
});

/**
 * GET /api/integrations/config
 * Check if integrations are configured (for UI)
 */
router.get('/config', async (_req: Request, res: Response) => {
    res.json({
        success: true,
        data: {
            instagram: {
                configured: isInstagramConfigured(),
                appId: process.env.INSTAGRAM_APP_ID ? 'configured' : 'not_configured'
            }
        }
    });
});

export default router;
