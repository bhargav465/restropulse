/**
 * Token Refresh Cron Service
 * Automatically refreshes Instagram tokens before they expire
 */

import cron from 'node-cron';
import { getRestaurantsCollection } from '@restropulse/db';
import { refreshAccessToken } from './meta-api.js';
import { encrypt } from './encryption.js';

// Track failed refresh attempts for analytics
interface RefreshAttempt {
    restaurantId: string;
    timestamp: Date;
    success: boolean;
    error?: string;
}

const refreshAttempts: RefreshAttempt[] = [];

/**
 * Get restaurants that need token refresh
 * Refreshes tokens 15 days before expiry to ensure buffer
 */
export async function getRestaurantsNeedingRefresh(): Promise<any[]> {
    const col = getRestaurantsCollection();
    const fifteenDaysFromNow = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

    const restaurants = await col.find({
        'instagramCredentials.accessToken': { $exists: true, $ne: null },
        'instagramCredentials.tokenExpiresAt': { $lt: fifteenDaysFromNow }
    }).toArray();

    return restaurants;
}

/**
 * Refresh token for a single restaurant
 */
export async function refreshRestaurantToken(restaurant: any): Promise<boolean> {
    const restaurantId = restaurant._id.toString();
    const credentials = restaurant.instagramCredentials;

    if (!credentials?.accessToken) {
        console.log(`[Token Refresh] No credentials for restaurant ${restaurantId}`);
        return false;
    }

    console.log(`[Token Refresh] Refreshing token for restaurant ${restaurantId} (@${credentials.username})`);

    try {
        const result = await refreshAccessToken(credentials.accessToken);

        if (!result) {
            console.error(`[Token Refresh] Failed to refresh token for ${restaurantId}`);
            refreshAttempts.push({
                restaurantId,
                timestamp: new Date(),
                success: false,
                error: 'Token refresh API call failed'
            });
            return false;
        }

        // Update database with new token
        const col = getRestaurantsCollection();
        await col.updateOne(
            { _id: restaurant._id },
            {
                $set: {
                    'instagramCredentials.accessToken': encrypt(result.accessToken),
                    'instagramCredentials.tokenExpiresAt': result.expiresAt,
                    'instagramCredentials.lastRefreshedAt': new Date(),
                    updatedAt: new Date()
                }
            }
        );

        console.log(`[Token Refresh] Successfully refreshed token for ${restaurantId}, expires: ${result.expiresAt.toISOString()}`);
        refreshAttempts.push({
            restaurantId,
            timestamp: new Date(),
            success: true
        });

        return true;
    } catch (error) {
        console.error(`[Token Refresh] Error refreshing token for ${restaurantId}:`, error);
        refreshAttempts.push({
            restaurantId,
            timestamp: new Date(),
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        return false;
    }
}

/**
 * Run the token refresh job
 */
async function runTokenRefreshJob(): Promise<void> {
    console.log(`[Token Refresh] Starting scheduled token refresh job at ${new Date().toISOString()}`);

    try {
        const restaurants = await getRestaurantsNeedingRefresh();

        if (restaurants.length === 0) {
            console.log('[Token Refresh] No tokens need refreshing');
            return;
        }

        console.log(`[Token Refresh] Found ${restaurants.length} restaurants needing token refresh`);

        let successCount = 0;
        let failCount = 0;

        for (const restaurant of restaurants) {
            const success = await refreshRestaurantToken(restaurant);
            if (success) {
                successCount++;
            } else {
                failCount++;
            }

            // Add small delay between refreshes to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log(`[Token Refresh] Completed: ${successCount} successful, ${failCount} failed`);
    } catch (error) {
        console.error('[Token Refresh] Job failed:', error);
    }
}

/**
 * On-demand token refresh check
 * Called before Instagram API operations
 */
export async function checkAndRefreshTokenIfNeeded(restaurantId: string): Promise<boolean> {
    const col = getRestaurantsCollection();
    const restaurant = await col.findOne({ _id: restaurantId as any });

    if (!restaurant?.instagramCredentials?.accessToken) {
        return false;
    }

    const credentials = restaurant.instagramCredentials;
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // If token expires in less than 7 days, refresh it now
    if (new Date(credentials.tokenExpiresAt) < sevenDaysFromNow) {
        console.log(`[Token Refresh] On-demand refresh for restaurant ${restaurantId}`);
        return await refreshRestaurantToken(restaurant);
    }

    return true;
}

/**
 * Get recent refresh attempts for monitoring
 */
export function getRecentRefreshAttempts(limit: number = 50): RefreshAttempt[] {
    return refreshAttempts.slice(-limit);
}

/**
 * Start the cron job for token refresh
 * Runs daily at 2:00 AM
 */
export function startTokenRefreshCron(): void {
    // Schedule: At 2:00 AM every day
    const job = cron.schedule('0 2 * * *', async () => {
        await runTokenRefreshJob();
    }, {
        timezone: 'Asia/Kolkata' // Adjust timezone as needed
    });

    console.log('[Token Refresh] Cron job scheduled: Daily at 2:00 AM IST');

    // Also run immediately on startup in development (for testing)
    if (process.env.NODE_ENV === 'development') {
        console.log('[Token Refresh] Development mode: Running initial check...');
        setTimeout(async () => {
            await runTokenRefreshJob();
        }, 5000); // Wait 5 seconds for DB connection
    }
}

/**
 * Manually trigger token refresh job (for admin/testing)
 */
export async function triggerManualRefresh(): Promise<{ success: number; failed: number }> {
    console.log('[Token Refresh] Manual refresh triggered');

    const restaurants = await getRestaurantsNeedingRefresh();
    let success = 0;
    let failed = 0;

    for (const restaurant of restaurants) {
        const result = await refreshRestaurantToken(restaurant);
        if (result) success++;
        else failed++;
    }

    return { success, failed };
}
