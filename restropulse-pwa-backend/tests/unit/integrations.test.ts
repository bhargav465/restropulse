// Set INSTAGRAM_APP_SECRET before any module imports to ensure it's available 
// when integrations.ts module is loaded
process.env.INSTAGRAM_APP_SECRET = 'test-app-secret';

import { describe, it, test, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';

// Define Mocks for Services
const mockGenerateOAuthUrl = vi.fn();
const mockHandleOAuthCallback = vi.fn();
const mockIsInstagramConfigured = vi.fn();
const mockGetInstagramProfile = vi.fn();
const mockValidateStateToken = vi.fn();
const mockCheckAndRefreshTokenIfNeeded = vi.fn();
const mockValidateToken = vi.fn();
const mockGetRestaurantsCollection = vi.fn();

// Mock Services
vi.mock('../../src/services/instagram-api.js', () => ({
    generateOAuthUrl: mockGenerateOAuthUrl,
    handleOAuthCallback: mockHandleOAuthCallback,
    isInstagramConfigured: mockIsInstagramConfigured,
    getInstagramProfile: mockGetInstagramProfile,
    validateStateToken: mockValidateStateToken,
    prepareCredentialsForStorage: vi.fn((account: any, token, expiresAt) => ({
        userId: account.id,
        accessToken: 'encrypted_token',
        tokenExpiresAt: expiresAt,
        username: account.username,
        name: account.name
    })),
    refreshAccessToken: vi.fn(),
    validateToken: mockValidateToken
}));

vi.mock('../../src/services/token-refresh-cron.js', () => ({
    checkAndRefreshTokenIfNeeded: mockCheckAndRefreshTokenIfNeeded,
    triggerManualRefresh: vi.fn()
}));

// Mock Database Connection
vi.mock('../../src/db/connection.js', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
        getRestaurantsCollection: mockGetRestaurantsCollection
    };
});

// Import actual implementation using vi.importActual to get real implementations
let realConnection: any;

// Helper to reset mocks
const useActualImplementation = async () => {
    if (!realConnection) {
        realConnection = await vi.importActual('../../src/db/connection.js');
    }
    mockGetRestaurantsCollection.mockImplementation(realConnection.getRestaurantsCollection);
};

// Import App (Dynamic)
const { createTestApp } = await import('../helpers/testHelper.js');
const app = createTestApp();

describe('Integration Routes', () => {

    beforeEach(async () => {
        vi.clearAllMocks();
        await useActualImplementation(); // Default to real DB

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
        it('should return oauth url', async () => {
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

        it('should pass onboarding=false by default', async () => {
            mockIsInstagramConfigured.mockReturnValue(true);
            mockGenerateOAuthUrl.mockReturnValue({ url: 'https://test', state: 's' });

            await request(app)
                .get('/api/integrations/instagram/oauth-url')
                .query({ restaurantId: 'r1' });

            expect(mockGenerateOAuthUrl).toHaveBeenCalledWith('r1', false);
        });

        it('should pass onboarding=true when specified', async () => {
            mockIsInstagramConfigured.mockReturnValue(true);
            mockGenerateOAuthUrl.mockReturnValue({ url: 'https://test', state: 's' });

            await request(app)
                .get('/api/integrations/instagram/oauth-url')
                .query({ restaurantId: 'r1', onboarding: 'true' });

            expect(mockGenerateOAuthUrl).toHaveBeenCalledWith('r1', true);
        });

        it('should return error if not configured', async () => {
            mockIsInstagramConfigured.mockReturnValue(false);

            const response = await request(app)
                .get('/api/integrations/instagram/oauth-url')
                .query({ restaurantId: 'r1' });

            expect(response.status).toBe(503);
        });

        it('should fail without restaurantId', async () => {
            const response = await request(app)
                .get('/api/integrations/instagram/oauth-url');

            expect(response.status).toBe(400);
        });

        it('should handle generation error', async () => {
            mockIsInstagramConfigured.mockReturnValue(true);
            mockGenerateOAuthUrl.mockImplementation(() => { throw new Error('Gen failed'); });

            const response = await request(app)
                .get('/api/integrations/instagram/oauth-url')
                .query({ restaurantId: 'r1' });

            expect(response.status).toBe(500);
        });
    });

    describe('GET /api/integrations/instagram/callback', () => {
        it('should redirect on missing params', async () => {
            const response = await request(app)
                .get('/api/integrations/instagram/callback');

            expect(response.status).toBe(302);
            expect(response.header.location).toContain('error=missing_params');
        });

        it('should redirect on oauth error', async () => {
            const response = await request(app)
                .get('/api/integrations/instagram/callback')
                .query({ error: 'access_denied', error_description: 'User denied' });

            expect(response.status).toBe(302);
            expect(response.header.location).toContain('error=oauth_denied');
        });

        it('should redirect on invalid state token', async () => {
            mockValidateStateToken.mockReturnValue({ valid: false });

            const response = await request(app)
                .get('/api/integrations/instagram/callback')
                .query({ code: 'valid-code', state: 'invalid-state' });

            expect(response.status).toBe(302);
            expect(response.header.location).toContain('error=invalid_state');
        });

        it('should process callback and show selection', async () => {
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

        it('should call handleOAuthCallback with skipStateValidation=true', async () => {
            mockValidateStateToken.mockReturnValue({ valid: true, restaurantId: 'r1' });
            mockHandleOAuthCallback.mockResolvedValue({
                success: true,
                account: { id: 'ig-1', username: 'test', pageName: 'Page' },
                accessToken: 't',
                tokenExpiresAt: new Date()
            });

            await request(app)
                .get('/api/integrations/instagram/callback')
                .query({ code: 'c', state: 's' });

            // Verify skipStateValidation=true was passed
            expect(mockHandleOAuthCallback).toHaveBeenCalledWith('c', 's', true);
        });

        it('should handle multiple accounts selection', async () => {
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

        it('should handle multiple accounts selection', async () => {
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

        it('should handle failure from service', async () => {
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

        it('should handle exception during callback', async () => {
            mockValidateStateToken.mockImplementation(() => { throw new Error('Boom'); });

            const response = await request(app)
                .get('/api/integrations/instagram/callback')
                .query({ code: 'c', state: 's' });

            expect(response.status).toBe(302);
            expect(response.header.location).toContain('error=server_error');
        });
    });

    describe('POST /api/integrations/instagram/callback', () => {
        it('should handle missing params', async () => {
            const res = await request(app).post('/api/integrations/instagram/callback').send({});
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('MISSING_PARAMS');
        });

        it('should handle service failure', async () => {
            mockHandleOAuthCallback.mockResolvedValue({ success: false, error: 'fail' });
            const res = await request(app).post('/api/integrations/instagram/callback').send({ code: 'c', state: 's' });
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('fail');
        });
    });

    describe('GET /api/integrations/instagram/status/:restaurantId', () => {
        it('should return status', async () => {
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

        it('should handle database error', async () => {
            mockGetRestaurantsCollection.mockReturnValue({
                findOne: vi.fn().mockRejectedValue(new Error('DB Fail'))
            });

            const response = await request(app)
                .get('/api/integrations/instagram/status/r1');

            expect(response.status).toBe(500);
        });

        it('should handle restaurant not found', async () => {
            // We can let the real DB handle not found, or mock it.
            // Real DB returns null for invalid ID
            const response = await request(app).get('/api/integrations/instagram/status/bad-id');
            expect(response.status).toBe(404);
        });
    });

    describe('DELETE /api/integrations/instagram/disconnect/:restaurantId', () => {
        it('should disconnect integration', async () => {
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

        it('should handle database error', async () => {
            mockGetRestaurantsCollection.mockReturnValue({
                updateOne: vi.fn().mockRejectedValue(new Error('DB Fail'))
            });

            const response = await request(app)
                .delete('/api/integrations/instagram/disconnect/r1');

            expect(response.status).toBe(500);
        });
    });

    describe('POST /api/integrations/instagram/select-account', () => {
        it('should successfully select account flow', async () => {
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

        it('should fail with invalid selectionId', async () => {
            const response = await request(app)
                .post('/api/integrations/instagram/select-account')
                .send({ selectionId: 'invalid', accountId: 'acc1' });

            expect(response.status).toBe(404);
        });

        it('should handle database error during save', async () => {
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
                updateOne: vi.fn().mockRejectedValue(new Error('Save failed'))
            });

            const response = await request(app)
                .post('/api/integrations/instagram/select-account')
                .send({ selectionId: id, accountId: 'a1' });

            expect(response.status).toBe(500);
        });
    });

    describe('POST /api/integrations/instagram/refresh/:restaurantId', () => {
        it('should refresh token successfully', async () => {
            mockCheckAndRefreshTokenIfNeeded.mockResolvedValue(true);

            const response = await request(app)
                .post('/api/integrations/instagram/refresh/r1');

            expect(response.status).toBe(200);
        });

        it('should handle refresh failure', async () => {
            mockCheckAndRefreshTokenIfNeeded.mockResolvedValue(false);

            const response = await request(app)
                .post('/api/integrations/instagram/refresh/r1');

            expect(response.status).toBe(400);
        });

        it('should handle exception', async () => {
            mockCheckAndRefreshTokenIfNeeded.mockRejectedValue(new Error('Fail'));
            const response = await request(app).post('/api/integrations/instagram/refresh/r1');
            expect(response.status).toBe(500);
        });
    });

    describe('POST /api/integrations/instagram/validate/:restaurantId', () => {
        it('should validate valid token', async () => {
            mockValidateToken.mockResolvedValue(true);
            const response = await request(app).post('/api/integrations/instagram/validate/r1');
            expect(response.status).toBe(200);
            expect(response.body.data.valid).toBe(true);
        });

        it('should handle invalid token (updates DB)', async () => {
            mockValidateToken.mockResolvedValue(false);
            const response = await request(app).post('/api/integrations/instagram/validate/r1');
            expect(response.status).toBe(200);
            expect(response.body.data.valid).toBe(false);

            // Verify DB update (disconnected) - switch to viewing real DB
            const col = realConnection.getRestaurantsCollection();
            const r = await col.findOne({ _id: 'r1' } as any);
            expect(r?.integrations?.instagram).toBe(false);
        });

        it('should error if no credentials', async () => {
            const col = realConnection.getRestaurantsCollection();
            await col.updateOne({ _id: 'r1' } as any, { $unset: { instagramCredentials: '' } });

            const response = await request(app).post('/api/integrations/instagram/validate/r1');
            expect(response.status).toBe(400);
        });
    });

    describe('GET /api/integrations/instagram/profile/:restaurantId', () => {
        it('should get profile', async () => {
            mockGetInstagramProfile.mockResolvedValue({ username: 'my_profile', name: 'My Profile' });
            mockCheckAndRefreshTokenIfNeeded.mockResolvedValue(true);

            const response = await request(app).get('/api/integrations/instagram/profile/r1');

            expect(response.status).toBe(200);
            expect(response.body.data.username).toBe('my_profile');
        });

        it('should error if profile fetch fails', async () => {
            mockGetInstagramProfile.mockResolvedValue(null);
            mockCheckAndRefreshTokenIfNeeded.mockResolvedValue(true); // Token ok, but profile fetch failed

            const response = await request(app).get('/api/integrations/instagram/profile/r1');

            expect(response.status).toBe(400);
        });
    });

    describe('GET /api/integrations/config', () => {
        it('should return config status', async () => {
            mockIsInstagramConfigured.mockReturnValue(true);
            const response = await request(app).get('/api/integrations/config');

            expect(response.status).toBe(200);
            expect(response.body.data.instagram.configured).toBe(true);
        });
    });

    describe('POST /api/integrations/instagram/deauthorize', () => {
        // Helper to create valid signed_request for testing
        // Must use the same secret as set in tests/setup.ts
        const createSignedRequest = (userId: string): string => {
            const appSecret = 'test-app-secret';
            const payload = Buffer.from(JSON.stringify({ user_id: userId })).toString('base64');
            const sig = crypto
                .createHmac('sha256', appSecret)
                .update(payload)
                .digest('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');
            return `${sig}.${payload}`;
        };

        it('should fail without signed_request', async () => {
            const response = await request(app)
                .post('/api/integrations/instagram/deauthorize')
                .send({});

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Missing signed_request');
        });

        it('should fail with invalid signed_request', async () => {
            const response = await request(app)
                .post('/api/integrations/instagram/deauthorize')
                .send({ signed_request: 'invalid.payload' });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Invalid signed_request');
        });

        it('should fail with malformed signed_request (no dot)', async () => {
            const response = await request(app)
                .post('/api/integrations/instagram/deauthorize')
                .send({ signed_request: 'nodotseparator' });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Invalid signed_request');
        });

        it('should successfully deauthorize with valid signed_request', async () => {
            const mockUpdateMany = vi.fn().mockResolvedValue({ modifiedCount: 1 });
            mockGetRestaurantsCollection.mockReturnValue({ updateMany: mockUpdateMany });

            const signedRequest = createSignedRequest('test-user-123');

            const response = await request(app)
                .post('/api/integrations/instagram/deauthorize')
                .send({ signed_request: signedRequest });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(mockUpdateMany).toHaveBeenCalledWith(
                { 'instagramCredentials.userId': 'test-user-123' },
                expect.objectContaining({
                    $set: expect.objectContaining({
                        'integrations.instagram': false,
                        'instagramCredentials.accessToken': null
                    })
                })
            );
        });

        it('should return 200 even when database error occurs', async () => {
            mockGetRestaurantsCollection.mockReturnValue({
                updateMany: vi.fn().mockRejectedValue(new Error('DB Error'))
            });

            const signedRequest = createSignedRequest('test-user-456');

            const response = await request(app)
                .post('/api/integrations/instagram/deauthorize')
                .send({ signed_request: signedRequest });

            // Should still return 200 to acknowledge receipt
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        });
    });

    describe('POST /api/integrations/instagram/data-deletion', () => {
        // Helper to create valid signed_request for testing
        // Must use the same secret as set in tests/setup.ts
        const createSignedRequest = (userId: string): string => {
            const appSecret = 'test-app-secret';
            const payload = Buffer.from(JSON.stringify({ user_id: userId })).toString('base64');
            const sig = crypto
                .createHmac('sha256', appSecret)
                .update(payload)
                .digest('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');
            return `${sig}.${payload}`;
        };

        it('should fail without signed_request', async () => {
            const response = await request(app)
                .post('/api/integrations/instagram/data-deletion')
                .send({});

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Missing signed_request');
        });

        it('should fail with invalid signed_request', async () => {
            const response = await request(app)
                .post('/api/integrations/instagram/data-deletion')
                .send({ signed_request: 'bad.data' });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Invalid signed_request');
        });

        it('should successfully process data deletion with valid signed_request', async () => {
            const mockUpdateMany = vi.fn().mockResolvedValue({ modifiedCount: 1 });
            mockGetRestaurantsCollection.mockReturnValue({ updateMany: mockUpdateMany });

            const signedRequest = createSignedRequest('test-user-789');

            const response = await request(app)
                .post('/api/integrations/instagram/data-deletion')
                .send({ signed_request: signedRequest });

            expect(response.status).toBe(200);
            expect(response.body.confirmation_code).toBeDefined();
            expect(response.body.url).toContain('/api/integrations/instagram/data-deletion-status');
            expect(response.body.url).toContain(response.body.confirmation_code);
            expect(mockUpdateMany).toHaveBeenCalledWith(
                { 'instagramCredentials.userId': 'test-user-789' },
                expect.objectContaining({
                    $unset: { instagramCredentials: '' },
                    $set: expect.objectContaining({ 'integrations.instagram': false })
                })
            );
        });

        it('should return 500 when database error occurs', async () => {
            mockGetRestaurantsCollection.mockReturnValue({
                updateMany: vi.fn().mockRejectedValue(new Error('DB Error'))
            });

            const signedRequest = createSignedRequest('test-user-error');

            const response = await request(app)
                .post('/api/integrations/instagram/data-deletion')
                .send({ signed_request: signedRequest });

            expect(response.status).toBe(500);
            expect(response.body.error).toBe('Failed to process deletion request');
        });
    });

    describe('GET /api/integrations/instagram/data-deletion-status', () => {
        it('should fail without code', async () => {
            const response = await request(app)
                .get('/api/integrations/instagram/data-deletion-status');

            expect(response.status).toBe(400);
            expect(response.text).toContain('Missing confirmation code');
        });

        it('should return 404 for unknown code', async () => {
            const response = await request(app)
                .get('/api/integrations/instagram/data-deletion-status')
                .query({ code: 'unknown-code' });

            expect(response.status).toBe(404);
            expect(response.text).toContain('Request Not Found');
        });

        it('should return status for valid confirmation code', async () => {
            // First create a data deletion request
            // Helper to create valid signed_request - must use same secret as tests/setup.ts
            const createSignedRequest = (userId: string): string => {
                const appSecret = 'test-app-secret';
                const payload = Buffer.from(JSON.stringify({ user_id: userId })).toString('base64');
                const sig = crypto
                    .createHmac('sha256', appSecret)
                    .update(payload)
                    .digest('base64')
                    .replace(/\+/g, '-')
                    .replace(/\//g, '_')
                    .replace(/=+$/, '');
                return `${sig}.${payload}`;
            };

            mockGetRestaurantsCollection.mockReturnValue({
                updateMany: vi.fn().mockResolvedValue({ modifiedCount: 1 })
            });

            const signedRequest = createSignedRequest('status-test-user');
            const createResponse = await request(app)
                .post('/api/integrations/instagram/data-deletion')
                .send({ signed_request: signedRequest });

            const confirmationCode = createResponse.body.confirmation_code;

            // Now check the status
            const statusResponse = await request(app)
                .get('/api/integrations/instagram/data-deletion-status')
                .query({ code: confirmationCode });

            expect(statusResponse.status).toBe(200);
            expect(statusResponse.text).toContain('Data Deletion Status');
            expect(statusResponse.text).toContain(confirmationCode);
            expect(statusResponse.text).toContain('Completed');
        });
    });
});
