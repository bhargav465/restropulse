
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Create mocks
const mockToArray = jest.fn();
const mockFindOne = jest.fn();
const mockFind = jest.fn(() => ({ toArray: mockToArray }));
const mockUpdateOne = jest.fn();
const mockCollection = {
    find: mockFind,
    findOne: mockFindOne,
    updateOne: mockUpdateOne
};
const mockGetRestaurantsCollection = jest.fn(() => mockCollection);

const mockRefreshAccessToken = jest.fn();
const mockEncrypt = jest.fn((val: string) => `encrypted_${val}`);
const mockSchedule = jest.fn();

// Mock modules BEFORE importing the subject
// await jest.unstable_mockModule('../../src/db/connection.js', () => ({
//    getRestaurantsCollection: mockGetRestaurantsCollection
// }));

await jest.unstable_mockModule('../../src/services/instagram-api.js', () => ({
    refreshAccessToken: mockRefreshAccessToken
}));

await jest.unstable_mockModule('../../src/services/encryption.js', () => ({
    encrypt: mockEncrypt
}));

await jest.unstable_mockModule('node-cron', () => ({
    default: { schedule: mockSchedule }
}));


import { getRestaurantsCollection } from '../../src/db/connection.js';

// Import subject
const {
    getRestaurantsNeedingRefresh,
    refreshRestaurantToken,
    checkAndRefreshTokenIfNeeded,
    triggerManualRefresh,
    getRecentRefreshAttempts,
    startTokenRefreshCron
} = await import('../../src/services/token-refresh-cron.js');

describe('Token Refresh Cron Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Setup default mock return for mock from manual mock file
        (getRestaurantsCollection as unknown as jest.Mock).mockReturnValue(mockCollection);
    });

    describe('getRestaurantsNeedingRefresh', () => {
        test('should query restaurants with expiring tokens', async () => {
            (mockToArray as any).mockResolvedValue(['res1', 'res2']);

            const result = await getRestaurantsNeedingRefresh();

            expect(getRestaurantsCollection).toHaveBeenCalled();
            expect(mockFind).toHaveBeenCalledWith({
                'instagramCredentials.accessToken': { $exists: true, $ne: null },
                'instagramCredentials.tokenExpiresAt': { $lt: expect.any(Date) }
            });
            expect(result).toEqual(['res1', 'res2']);
        });
    });

    describe('refreshRestaurantToken', () => {
        const mockRestaurant = {
            _id: 'res-123',
            instagramCredentials: {
                username: 'my_ig',
                accessToken: 'old-token'
            }
        };

        test('should skip if no credentials', async () => {
            const result = await refreshRestaurantToken({ _id: 'res-123' });
            expect(result).toBe(false);
            expect(mockRefreshAccessToken).not.toHaveBeenCalled();
        });

        test('should refresh token successfully', async () => {
            const now = new Date();
            (mockRefreshAccessToken as any).mockResolvedValue({
                accessToken: 'new-token',
                expiresAt: now
            });

            const result = await refreshRestaurantToken(mockRestaurant);

            expect(result).toBe(true);
            expect(mockRefreshAccessToken).toHaveBeenCalledWith('old-token');
            expect(mockUpdateOne).toHaveBeenCalledWith(
                { _id: mockRestaurant._id },
                {
                    $set: {
                        'instagramCredentials.accessToken': 'encrypted_new-token',
                        'instagramCredentials.tokenExpiresAt': now,
                        'instagramCredentials.lastRefreshedAt': expect.any(Date),
                        updatedAt: expect.any(Date)
                    }
                }
            );
        });

        test('should handle refresh failure', async () => {
            (mockRefreshAccessToken as any).mockResolvedValue(null);

            const result = await refreshRestaurantToken(mockRestaurant);

            expect(result).toBe(false);
            expect(mockUpdateOne).not.toHaveBeenCalled();
        });

        test('should handle exception', async () => {
            (mockRefreshAccessToken as any).mockRejectedValue(new Error('API Error'));

            const result = await refreshRestaurantToken(mockRestaurant);

            expect(result).toBe(false);
        });
    });

    describe('checkAndRefreshTokenIfNeeded', () => {
        const mockRestaurant = {
            _id: 'res-123',
            instagramCredentials: {
                username: 'my_ig',
                accessToken: 'old-token',
                tokenExpiresAt: new Date(Date.now() + 86400000) // 1 day
            }
        };

        test('should return false if restaurant not found or no credentials', async () => {
            (mockFindOne as any).mockResolvedValue(null);
            let result = await checkAndRefreshTokenIfNeeded('res-123');
            expect(result).toBe(false);

            (mockFindOne as any).mockResolvedValue({});
            result = await checkAndRefreshTokenIfNeeded('res-123');
            expect(result).toBe(false);
        });

        test('should refresh if token expiring in < 7 days', async () => {
            // Expires in 1 day
            (mockFindOne as any).mockResolvedValue(mockRestaurant);
            (mockRefreshAccessToken as any).mockResolvedValue({ accessToken: 'new', expiresAt: new Date() });

            const result = await checkAndRefreshTokenIfNeeded('res-123');

            expect(result).toBe(true);
            expect(mockRefreshAccessToken).toHaveBeenCalled();
        });

        test('should NOT refresh if token valid for > 7 days', async () => {
            (mockFindOne as any).mockResolvedValue({
                ...mockRestaurant,
                instagramCredentials: {
                    ...mockRestaurant.instagramCredentials,
                    tokenExpiresAt: new Date(Date.now() + 8 * 24 * 3600 * 1000) // 8 days
                }
            });

            const result = await checkAndRefreshTokenIfNeeded('res-123');

            expect(result).toBe(true);
            expect(mockRefreshAccessToken).not.toHaveBeenCalled();
        });
    });

    describe('triggerManualRefresh', () => {
        test('should trigger refresh for all needed restaurants', async () => {
            const restaurants = [
                { _id: 'r1', instagramCredentials: { accessToken: 't1' } },
                { _id: 'r2', instagramCredentials: { accessToken: 't2' } }
            ];
            (mockToArray as any).mockResolvedValue(restaurants);
            (mockRefreshAccessToken as any)
                .mockResolvedValueOnce({ accessToken: 'new1', expiresAt: new Date() }) // r1 success
                .mockResolvedValueOnce(null); // r2 fail

            const result = await triggerManualRefresh();

            expect(result.success).toBe(1);
            expect(result.failed).toBe(1);
        });
    });

    describe('getRecentRefreshAttempts', () => {
        test('should return attempts list', () => {
            const attempts = getRecentRefreshAttempts();
            expect(Array.isArray(attempts)).toBe(true);
        });
    });

    describe('startTokenRefreshCron', () => {
        beforeEach(() => {
            jest.clearAllMocks();
            (getRestaurantsCollection as unknown as jest.Mock).mockReturnValue(mockCollection);
        });

        test('should schedule cron job', () => {
            startTokenRefreshCron();
            expect(mockSchedule).toHaveBeenCalledWith('0 2 * * *', expect.any(Function), expect.any(Object));
        });

        test('should execute scheduled job callback with items', async () => {
            jest.useFakeTimers();

            // Setup mock data for the job execution
            (mockToArray as any).mockResolvedValue([{
                _id: 'cron-res',
                instagramCredentials: { accessToken: 'cron-token', tokenExpiresAt: new Date(), username: 'cron-user' }
            }]);
            (mockRefreshAccessToken as any).mockResolvedValue({ accessToken: 'refreshed', expiresAt: new Date() });

            startTokenRefreshCron();

            // Get the callback passed to cron.schedule from the LAST call
            const calls = mockSchedule.mock.calls;
            const cronCallback = calls[calls.length - 1][1] as any;

            const callbackPromise = cronCallback(); // Execute it

            // Advance past the 1-second rate-limit delay between refreshes
            await jest.advanceTimersByTimeAsync(1000);

            await callbackPromise;

            // Verify it did work
            expect(mockFind).toHaveBeenCalled();
            expect(mockRefreshAccessToken).toHaveBeenCalledWith('cron-token');
            expect(mockUpdateOne).toHaveBeenCalledWith(
                { _id: 'cron-res' },
                expect.any(Object)
            );

            jest.useRealTimers();
        });

        test('should execute scheduled job callback with NO items', async () => {
            // Return empty list
            (mockToArray as any).mockResolvedValue([]);

            startTokenRefreshCron();

            const calls = mockSchedule.mock.calls;
            const cronCallback = calls[calls.length - 1][1] as any;

            await cronCallback(); // Execute it

            expect(mockFind).toHaveBeenCalled();
            expect(mockRefreshAccessToken).not.toHaveBeenCalled();
        });
    });
});
