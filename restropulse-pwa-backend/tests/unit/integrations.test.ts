import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import request from 'supertest';

// 1. Import Actual Connection
import * as realConnection from '../../src/db/connection.js';

// 2. Define Mocks for Services
const mockGenerateOAuthUrl = jest.fn<any>();
const mockHandleOAuthCallback = jest.fn<any>();
const mockIsInstagramConfigured = jest.fn<any>();
const mockGetInstagramProfile = jest.fn<any>();
const mockValidateStateToken = jest.fn<any>();
const mockCheckAndRefreshTokenIfNeeded = jest.fn<any>();
const mockValidateToken = jest.fn<any>();

// 3. Mock Services
await jest.unstable_mockModule('../../src/services/instagram-api.js', () => ({
    generateOAuthUrl: mockGenerateOAuthUrl,
    handleOAuthCallback: mockHandleOAuthCallback,
    isInstagramConfigured: mockIsInstagramConfigured,
    getInstagramProfile: mockGetInstagramProfile,
    validateStateToken: mockValidateStateToken,
    prepareCredentialsForStorage: jest.fn((account: any, token, expiresAt) => ({
        userId: account.id,
        accessToken: 'encrypted_token',
        tokenExpiresAt: expiresAt,
        username: account.username,
        name: account.name
    })),
    refreshAccessToken: jest.fn(),
    validateToken: mockValidateToken
}));

await jest.unstable_mockModule('../../src/services/token-refresh-cron.js', () => ({
    checkAndRefreshTokenIfNeeded: mockCheckAndRefreshTokenIfNeeded,
    triggerManualRefresh: jest.fn()
}));

// 4. Mock Database Connection with Spy
const mockGetRestaurantsCollection = jest.fn<any>();

await jest.unstable_mockModule('../../src/db/connection.js', () => ({
    __esModule: true,
    ...realConnection,
    getRestaurantsCollection: mockGetRestaurantsCollection
}));

// 5. Helper to reset mocks
const useActualImplementation = () => {
    mockGetRestaurantsCollection.mockImplementation(realConnection.getRestaurantsCollection);
};

// 6. Import App (Dynamic)
const { createTestApp } = await import('../helpers/testHelper.js');
const app = createTestApp();

describe('Integration Routes', () => {

    beforeEach(async () => {
        jest.clearAllMocks();
        useActualImplementation(); // Default to real DB

        // Seed Data
        const col = realConnection.getRestaurantsCollection();
        await col.deleteMany({});
        await col.insertOne({
            _id: 'r1',
            id: 'r1',
            name: 'Test Restaurant',
            instagramCredentials: {
                accessToken: 'valid-token',
                tokenExpiresAt: new Date(Date.now() + 86400000)
            }
        } as any);
    });

    describe('GET /api/integrations/instagram/oauth-url', () => {
        test('should return oauth url', async () => {
            mockIsInstagramConfigured.mockReturnValue(true);
            mockGenerateOAuthUrl.mockReturnValue({
                url: 'https://instagram.com/oauth',
                state: 'mock-state'
            });

            const response = await request(app)
                .get('/api/integrations/instagram/oauth-url')
                .query({ restaurantId: 'r1' });

            expect(response.status).toBe(200);
            expect(response.body.data.oauthUrl).toBe('https://instagram.com/oauth');
        });

        test('should return error if not configured', async () => {
            mockIsInstagramConfigured.mockReturnValue(false);

            const response = await request(app)
                .get('/api/integrations/instagram/oauth-url')
                .query({ restaurantId: 'r1' });

            expect(response.status).toBe(503);
        });

        test('should fail without restaurantId', async () => {
            const response = await request(app)
                .get('/api/integrations/instagram/oauth-url');

            expect(response.status).toBe(400);
        });

        test('should handle generation error', async () => {
            mockIsInstagramConfigured.mockReturnValue(true);
            mockGenerateOAuthUrl.mockImplementation(() => { throw new Error('Gen failed'); });

            const response = await request(app)
                .get('/api/integrations/instagram/oauth-url')
                .query({ restaurantId: 'r1' });

            expect(response.status).toBe(500);
        });
    });

    describe('GET /api/integrations/instagram/callback', () => {
        test('should redirect on missing params', async () => {
            const response = await request(app)
                .get('/api/integrations/instagram/callback');

            expect(response.status).toBe(302);
            expect(response.header.location).toContain('error=missing_params');
        });

        test('should redirect on oauth error', async () => {
            const response = await request(app)
                .get('/api/integrations/instagram/callback')
                .query({ error: 'access_denied', error_description: 'User denied' });

            expect(response.status).toBe(302);
            expect(response.header.location).toContain('error=oauth_denied');
        });

        test('should process callback and show selection', async () => {
            mockValidateStateToken.mockReturnValue({ valid: true, restaurantId: 'r1' });
            const expires = new Date(Date.now() + 3600000);

            mockHandleOAuthCallback.mockResolvedValue({
                success: true,
                account: { id: 'ig-123', name: 'IG Page', pageName: 'FB Page' },
                accessToken: 'token-123',
                tokenExpiresAt: expires,
                restaurantId: 'r1'
            });

            const response = await request(app)
                .get('/api/integrations/instagram/callback')
                .query({ code: 'valid-code', state: 'valid-state' });

            expect(response.status).toBe(302);
            expect(response.header.location).toContain('success=true');
        });

        test('should handle multiple accounts selection', async () => {
            mockValidateStateToken.mockReturnValue({ valid: true, restaurantId: 'r1' });

            mockHandleOAuthCallback.mockResolvedValue({
                success: true,
                accounts: [
                    { id: '1', name: 'A', pageName: 'PA' },
                    { id: '2', name: 'B', pageName: 'PB' }
                ],
                accessToken: 'token-123',
                tokenExpiresAt: new Date(),
                restaurantId: 'r1'
            });

            const response = await request(app)
                .get('/api/integrations/instagram/callback')
                .query({ code: 'valid-code', state: 'valid-state' });

            expect(response.status).toBe(302);
            expect(response.header.location).toContain('select=true');
        });

        test('should handle failure from service', async () => {
            mockValidateStateToken.mockReturnValue({ valid: true, restaurantId: 'r1' });
            mockHandleOAuthCallback.mockReturnValue({
                success: false,
                error: 'connection_failed'
            });

            const response = await request(app)
                .get('/api/integrations/instagram/callback')
                .query({ code: 'valid-code', state: 'valid-state' });

            expect(response.status).toBe(302);
            expect(response.header.location).toContain('error=connection_failed');
        });

        test('should handle exception during callback', async () => {
            mockValidateStateToken.mockImplementation(() => { throw new Error('Boom'); });

            const response = await request(app)
                .get('/api/integrations/instagram/callback')
                .query({ code: 'c', state: 's' });

            expect(response.status).toBe(302);
            expect(response.header.location).toContain('error=server_error');
        });
    });

    describe('POST /api/integrations/instagram/callback', () => {
        test('should handle missing params', async () => {
            const res = await request(app).post('/api/integrations/instagram/callback').send({});
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('MISSING_PARAMS');
        });

        test('should handle service failure', async () => {
            mockHandleOAuthCallback.mockResolvedValue({ success: false, error: 'fail' });
            const res = await request(app).post('/api/integrations/instagram/callback').send({ code: 'c', state: 's' });
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('fail');
        });
    });

    describe('GET /api/integrations/status/:restaurantId', () => {
        test('should return status', async () => {
            // Setup DB state
            const col = realConnection.getRestaurantsCollection();
            await col.updateOne({ _id: 'r1' } as any, {
                $set: { integrations: { instagram: true }, instagramCredentials: { username: 'my_ig' } }
            });

            const response = await request(app)
                .get('/api/integrations/instagram/status/r1');

            expect(response.status).toBe(200);
            expect(response.body.data.connected).toBe(true);
        });

        test('should handle database error', async () => {
            mockGetRestaurantsCollection.mockReturnValue({
                findOne: jest.fn<any>().mockRejectedValue(new Error('DB Fail'))
            });

            const response = await request(app)
                .get('/api/integrations/instagram/status/r1');

            expect(response.status).toBe(500);
        });

        test('should handle restaurant not found', async () => {
            // We can let the real DB handle not found, or mock it.
            // Real DB returns null for invalid ID
            const response = await request(app).get('/api/integrations/instagram/status/bad-id');
            expect(response.status).toBe(404);
        });
    });

    describe('POST /api/integrations/instagram/disconnect/:restaurantId', () => {
        test('should disconnect integration', async () => {
            const col = realConnection.getRestaurantsCollection();
            await col.updateOne({ _id: 'r1' } as any, {
                $set: { integrations: { instagram: true }, instagramCredentials: { token: 'abc' } }
            });

            const response = await request(app)
                .delete('/api/integrations/instagram/disconnect/r1');

            expect(response.status).toBe(200);

            const r = await col.findOne({ _id: 'r1' } as any);
            expect(r?.instagramCredentials).toBeUndefined();
        });

        test('should handle database error', async () => {
            mockGetRestaurantsCollection.mockReturnValue({
                updateOne: jest.fn<any>().mockRejectedValue(new Error('DB Fail'))
            });

            const response = await request(app)
                .delete('/api/integrations/instagram/disconnect/r1');

            expect(response.status).toBe(500);
        });
    });

    describe('POST /api/integrations/instagram/select-account', () => {
        test('should successfully select account flow', async () => {
            // 1. Setup Mock
            mockHandleOAuthCallback.mockReturnValue({
                success: true,
                accessToken: 'test-token',
                tokenExpiresAt: new Date(),
                accounts: [
                    { id: 'acc1', username: 'user1', name: 'User One' },
                    { id: 'acc2', username: 'user2', name: 'User Two' }
                ],
                restaurantId: 'r1'
            });
            mockValidateStateToken.mockReturnValue({ valid: true, restaurantId: 'r1' });

            // 2. Start Session
            const seedResponse = await request(app)
                .post('/api/integrations/instagram/callback')
                .send({ code: 'valid', state: 'valid' });

            const selectionId = seedResponse.body.data.selectionId;

            // 3. Select
            const response = await request(app)
                .post('/api/integrations/instagram/select-account')
                .send({ selectionId, accountId: 'acc1' });

            expect(response.status).toBe(200);
            expect(response.body.data.username).toBe('user1');
        });

        test('should fail with invalid selectionId', async () => {
            const response = await request(app)
                .post('/api/integrations/instagram/select-account')
                .send({ selectionId: 'invalid', accountId: 'acc1' });

            expect(response.status).toBe(404);
        });

        test('should handle database error during save', async () => {
            // 1. Start Session (Real DB)
            mockHandleOAuthCallback.mockReturnValue({
                success: true,
                accounts: [
                    { id: 'a1', username: 'u1' },
                    { id: 'a2', username: 'u2' }
                ],
                accessToken: 't',
                restaurantId: 'r1'
            });
            mockValidateStateToken.mockReturnValue({ valid: true, restaurantId: 'r1' });

            const seed = await request(app).post('/api/integrations/instagram/callback').send({ code: 'c', state: 's' });
            const id = seed.body.data.selectionId;

            // 2. Switch to Mock DB for error
            mockGetRestaurantsCollection.mockReturnValue({
                updateOne: jest.fn<any>().mockRejectedValue(new Error('Save failed'))
            });

            const response = await request(app)
                .post('/api/integrations/instagram/select-account')
                .send({ selectionId: id, accountId: 'a1' });

            expect(response.status).toBe(500);
        });
    });

    describe('POST /api/integrations/instagram/refresh/:restaurantId', () => {
        test('should refresh token successfully', async () => {
            mockCheckAndRefreshTokenIfNeeded.mockResolvedValue(true);

            const response = await request(app)
                .post('/api/integrations/instagram/refresh/r1');

            expect(response.status).toBe(200);
        });

        test('should handle refresh failure', async () => {
            mockCheckAndRefreshTokenIfNeeded.mockResolvedValue(false);

            const response = await request(app)
                .post('/api/integrations/instagram/refresh/r1');

            expect(response.status).toBe(400);
        });

        test('should handle exception', async () => {
            mockCheckAndRefreshTokenIfNeeded.mockRejectedValue(new Error('Fail'));
            const response = await request(app).post('/api/integrations/instagram/refresh/r1');
            expect(response.status).toBe(500);
        });
    });

    describe('POST /api/integrations/instagram/validate/:restaurantId', () => {
        test('should validate valid token', async () => {
            mockValidateToken.mockResolvedValue(true);
            const response = await request(app).post('/api/integrations/instagram/validate/r1');
            expect(response.status).toBe(200);
            expect(response.body.data.valid).toBe(true);
        });

        test('should handle invalid token (updates DB)', async () => {
            mockValidateToken.mockResolvedValue(false);
            const response = await request(app).post('/api/integrations/instagram/validate/r1');
            expect(response.status).toBe(200);
            expect(response.body.data.valid).toBe(false);

            // Verify DB update (disconnected) - switch to viewing real DB
            const col = realConnection.getRestaurantsCollection();
            const r = await col.findOne({ _id: 'r1' } as any);
            expect(r?.integrations?.instagram).toBe(false);
        });

        test('should error if no credentials', async () => {
            const col = realConnection.getRestaurantsCollection();
            await col.updateOne({ _id: 'r1' } as any, { $unset: { instagramCredentials: '' } });

            const response = await request(app).post('/api/integrations/instagram/validate/r1');
            expect(response.status).toBe(400);
        });
    });

    describe('GET /api/integrations/instagram/profile/:restaurantId', () => {
        test('should get profile', async () => {
            mockGetInstagramProfile.mockResolvedValue({ username: 'my_profile', name: 'My Profile' });
            mockCheckAndRefreshTokenIfNeeded.mockResolvedValue(true);

            const response = await request(app).get('/api/integrations/instagram/profile/r1');

            expect(response.status).toBe(200);
            expect(response.body.data.username).toBe('my_profile');
        });

        test('should error if profile fetch fails', async () => {
            mockGetInstagramProfile.mockResolvedValue(null);
            mockCheckAndRefreshTokenIfNeeded.mockResolvedValue(true); // Token ok, but profile fetch failed

            const response = await request(app).get('/api/integrations/instagram/profile/r1');

            expect(response.status).toBe(400);
        });
    });

    describe('GET /api/integrations/config', () => {
        test('should return config status', async () => {
            mockIsInstagramConfigured.mockReturnValue(true);
            const response = await request(app).get('/api/integrations/config');

            expect(response.status).toBe(200);
            expect(response.body.data.instagram.configured).toBe(true);
        });
    });
});
