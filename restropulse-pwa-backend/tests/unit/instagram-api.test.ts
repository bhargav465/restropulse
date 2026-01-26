import { jest, describe, test, expect, beforeEach, afterAll, beforeAll } from '@jest/globals';

// Set Env vars BEFORE any imports
process.env.INSTAGRAM_APP_ID = 'test-app-id';
process.env.INSTAGRAM_APP_SECRET = 'test-app-secret';
process.env.INSTAGRAM_REDIRECT_URI = 'http://localhost/callback';

// Mock axios
const mockGet = jest.fn<any>();
const mockPost = jest.fn<any>();

// Create mock axios instance
const mockAxiosInstance = {
    get: mockGet,
    post: mockPost
};

// Mock axios module using unstable_mockModule for ESM support
await jest.unstable_mockModule('axios', () => ({
    default: {
        get: mockGet,
        post: mockPost,
        create: jest.fn(() => mockAxiosInstance),
        isAxiosError: jest.fn()
    },
    AxiosError: class extends Error {
        response: any;
        constructor(message: string, response?: any) {
            super(message);
            this.response = response;
        }
    }
}));

// We use REAL encryption service for robust testing, instead of mocking it.
const { encrypt, decrypt } = await import('../../src/services/encryption.js');

// Dynamically import the service under test
const instagramService = await import('../../src/services/instagram-api.js');

describe('Instagram API Service', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Environment Config', () => {
        test('should detect configuration', () => {
            expect(instagramService.isInstagramConfigured()).toBe(true);
        });
    });

    describe('generateOAuthUrl', () => {
        test('should generate valid URL and state', () => {
            const { url, state } = instagramService.generateOAuthUrl('res-123');

            expect(url).toContain('https://www.facebook.com/v18.0/dialog/oauth');
            expect(url).toContain('client_id=test-app-id');
            expect(url).toMatch(/redirect_uri=http%3A%2F%2Flocalhost%2Fcallback/);
            // Verify state is a valid string (non-empty)
            expect(typeof state).toBe('string');
            expect(state.length).toBeGreaterThan(10);
        });
    });

    describe('validateStateToken', () => {
        test('should return valid result for correct state', () => {
            // Setup state using real encryption logic (via service helper)
            const { state } = instagramService.generateOAuthUrl('res-123');

            const result = instagramService.validateStateToken(state);
            expect(result).toEqual({ valid: true, restaurantId: 'res-123' });
        });

        test('should return invalid for unknown state', () => {
            const result = instagramService.validateStateToken('invalid-state');
            expect(result).toEqual({ valid: false });
        });

        test('should invalidate already used state token (one-time use)', () => {
            const { state } = instagramService.generateOAuthUrl('res-123');

            // First use - valid
            const firstResult = instagramService.validateStateToken(state);
            expect(firstResult).toEqual({ valid: true, restaurantId: 'res-123' });

            // Second use - invalid (already consumed)
            const secondResult = instagramService.validateStateToken(state);
            expect(secondResult).toEqual({ valid: false });
        });
    });

    describe('handleOAuthCallback', () => {
        test('should fail if state is invalid', async () => {
            const result = await instagramService.handleOAuthCallback('code', 'invalid-state');
            expect(result.success).toBe(false);
            expect(result.error).toBe('INVALID_STATE');
        });

        test('should fail if token exchange fails', async () => {
            const { state } = instagramService.generateOAuthUrl('res-123');
            mockGet.mockRejectedValueOnce(new Error('Token failed'));

            const result = await instagramService.handleOAuthCallback('code', state);
            expect(result.success).toBe(false);
            expect(result.error).toBe('TOKEN_EXCHANGE_FAILED');
        });

        test('should fail if permissions are missing', async () => {
            const { state } = instagramService.generateOAuthUrl('res-123');

            // 1. Token exchange success (code -> short -> long)
            mockGet.mockImplementation((url: any, config: any) => {
                if (url.includes('oauth/access_token')) {
                    if (config?.params?.grant_type === 'fb_exchange_token') { // long lived
                        return Promise.resolve({ data: { access_token: 'long-token', expires_in: 3600 } });
                    }
                    // default to short lived
                    return Promise.resolve({ data: { access_token: 'short-token', user_id: '123' } });
                }
                // 2. Permissions check
                if (url.includes('/me/permissions')) {
                    return Promise.resolve({
                        data: {
                            data: [
                                { permission: 'instagram_basic', status: 'granted' },
                                // Missing other required permissions
                            ]
                        }
                    });
                }
                return Promise.reject(new Error('Unknown url: ' + url));
            });

            const result = await instagramService.handleOAuthCallback('code-123', state);
            expect(result.success).toBe(false);
            expect(result.error).toBe('PERMISSIONS_MISSING');
        });

        test('should fail if no pages found', async () => {
            const { state } = instagramService.generateOAuthUrl('res-123');

            mockGet.mockImplementation((url: any) => {
                if (url.includes('oauth/access_token')) return Promise.resolve({ data: { access_token: 't', expires_in: 100 } });
                if (url.includes('/me/permissions')) {
                    return Promise.resolve({
                        data: {
                            data: ['instagram_basic', 'pages_show_list', 'pages_read_engagement', 'read_insights', 'business_management'].map(p => ({ permission: p, status: 'granted' }))
                        }
                    });
                }
                // 3. Pages check
                if (url.includes('/me/accounts')) {
                    return Promise.resolve({ data: { data: [] } });
                }
                return Promise.resolve({ data: {} });
            });

            const result = await instagramService.handleOAuthCallback('code-123', state);
            expect(result.success).toBe(false);
            expect(result.error).toBe('NO_PAGES_FOUND');
        });

        test('should fail if no IG account found on pages', async () => {
            const { state } = instagramService.generateOAuthUrl('res-123');

            mockGet.mockImplementation((url: any) => {
                if (url.includes('oauth/access_token')) return Promise.resolve({ data: { access_token: 't', expires_in: 100 } });
                if (url.includes('/me/permissions')) {
                    return Promise.resolve({
                        data: {
                            data: ['instagram_basic', 'pages_show_list', 'pages_read_engagement', 'read_insights', 'business_management'].map(p => ({ permission: p, status: 'granted' }))
                        }
                    });
                }
                if (url.includes('/me/accounts')) {
                    return Promise.resolve({
                        data: {
                            data: [{ id: 'page-1', access_token: 'pt', name: 'Page 1' }] // Page without IG
                        }
                    });
                }
                // Get IG account for page
                if (url.includes('page-1')) {
                    return Promise.resolve({ data: { instagram_business_account: null } }); // explicit null
                }
                return Promise.resolve({ data: {} });
            });

            const result = await instagramService.handleOAuthCallback('code-123', state);
            expect(result.success).toBe(false);
            expect(result.error).toBe('NO_IG_ACCOUNT_FOUND');
        });

        test('should succeed with multiple accounts', async () => {
            const { state } = instagramService.generateOAuthUrl('res-123');

            mockGet.mockImplementation((url: any) => {
                if (url.includes('oauth/access_token')) return Promise.resolve({ data: { access_token: 't', expires_in: 100 } });
                if (url.includes('/me/permissions')) {
                    return Promise.resolve({
                        data: {
                            data: ['instagram_basic', 'pages_show_list', 'pages_read_engagement', 'read_insights', 'business_management'].map(p => ({ permission: p, status: 'granted' }))
                        }
                    });
                }
                if (url.includes('/me/accounts')) {
                    return Promise.resolve({
                        data: {
                            data: [
                                { id: 'page-1', access_token: 'pt1', name: 'Page 1', instagram_business_account: { id: 'ig-1' } },
                                { id: 'page-2', access_token: 'pt2', name: 'Page 2', instagram_business_account: { id: 'ig-2' } }
                            ]
                        }
                    });
                }
                if (url.includes('ig-1')) {
                    return Promise.resolve({ data: { id: 'ig-1', username: 'user1', name: 'User 1' } });
                }
                if (url.includes('ig-2')) {
                    return Promise.resolve({ data: { id: 'ig-2', username: 'user2', name: 'User 2' } });
                }

                if (url.includes('page-1')) return Promise.resolve({ data: { instagram_business_account: { id: 'ig-1' } } });
                if (url.includes('page-2')) return Promise.resolve({ data: { instagram_business_account: { id: 'ig-2' } } });

                return Promise.resolve({ data: {} });
            });

            const result = await instagramService.handleOAuthCallback('code-123', state);
            expect(result.success).toBe(true);
            expect(result.accounts).toHaveLength(2);
            expect(result.account).toBeUndefined(); // No auto-select
        });

        test('should auto-select single account', async () => {
            const { state } = instagramService.generateOAuthUrl('res-single');

            mockGet.mockImplementation((url: any) => {
                if (url.includes('oauth/access_token')) return Promise.resolve({ data: { access_token: 't', expires_in: 100 } });
                if (url.includes('/me/permissions')) {
                    return Promise.resolve({
                        data: {
                            data: ['instagram_basic', 'pages_show_list', 'pages_read_engagement'].map(p => ({ permission: p, status: 'granted' }))
                        }
                    });
                }
                if (url.includes('/me/accounts')) {
                    return Promise.resolve({
                        data: {
                            data: [
                                { id: 'page-1', access_token: 'pt1', name: 'My Page' }
                            ]
                        }
                    });
                }
                // Page IG account lookup
                if (url.includes('page-1')) {
                    return Promise.resolve({ data: { instagram_business_account: { id: 'ig-1' }, name: 'My Page' } });
                }
                // IG account details
                if (url.includes('ig-1')) {
                    return Promise.resolve({ data: { id: 'ig-1', username: 'myuser', name: 'My User' } });
                }
                return Promise.resolve({ data: {} });
            });

            const result = await instagramService.handleOAuthCallback('code-123', state);
            expect(result.success).toBe(true);
            expect(result.account).toBeDefined(); // Auto-selected single account
            expect(result.account?.username).toBe('myuser');
            expect(result.accounts).toBeUndefined(); // Not multiple
        });

        test('should handle config error when not configured', async () => {
            // Temporarily clear config to test CONFIG_ERROR path
            const origAppId = process.env.INSTAGRAM_APP_ID;
            process.env.INSTAGRAM_APP_ID = '';

            // Re-import to pick up changed config
            jest.resetModules();
            const freshService = await import('../../src/services/instagram-api.js');

            const result = await freshService.handleOAuthCallback('code', 'state');
            expect(result.success).toBe(false);
            expect(result.error).toBe('CONFIG_ERROR');

            // Restore config
            process.env.INSTAGRAM_APP_ID = origAppId;
        });

        test('should handle page fetch error gracefully', async () => {
            const { state } = instagramService.generateOAuthUrl('res-page-err');

            mockGet.mockImplementation((url: any) => {
                if (url.includes('oauth/access_token')) return Promise.resolve({ data: { access_token: 't', expires_in: 100 } });
                if (url.includes('/me/permissions')) {
                    return Promise.resolve({
                        data: {
                            data: ['instagram_basic', 'pages_show_list', 'pages_read_engagement'].map(p => ({ permission: p, status: 'granted' }))
                        }
                    });
                }
                // Pages endpoint fails
                if (url.includes('/me/accounts')) {
                    return Promise.reject(new Error('Failed to fetch pages'));
                }
                return Promise.resolve({ data: {} });
            });

            const result = await instagramService.handleOAuthCallback('code-123', state);
            expect(result.success).toBe(false);
            expect(result.error).toBe('NO_PAGES_FOUND');
        });

        test('should handle IG account fetch error gracefully', async () => {
            const { state } = instagramService.generateOAuthUrl('res-ig-err');

            mockGet.mockImplementation((url: any) => {
                if (url.includes('oauth/access_token')) return Promise.resolve({ data: { access_token: 't', expires_in: 100 } });
                if (url.includes('/me/permissions')) {
                    return Promise.resolve({
                        data: {
                            data: ['instagram_basic', 'pages_show_list', 'pages_read_engagement'].map(p => ({ permission: p, status: 'granted' }))
                        }
                    });
                }
                if (url.includes('/me/accounts')) {
                    return Promise.resolve({
                        data: { data: [{ id: 'page-1', access_token: 'pt1', name: 'Page' }] }
                    });
                }
                // IG account lookup fails
                if (url.includes('page-1')) {
                    return Promise.reject(new Error('Failed to fetch IG account'));
                }
                return Promise.resolve({ data: {} });
            });

            const result = await instagramService.handleOAuthCallback('code-123', state);
            expect(result.success).toBe(false);
            expect(result.error).toBe('NO_IG_ACCOUNT_FOUND');
        });
    });

    describe('Token Management', () => {
        test('should refresh access token success', async () => {
            mockGet.mockImplementation((url: any, config: any) => {
                if (config?.params?.grant_type === 'fb_exchange_token') {
                    return Promise.resolve({
                        data: { access_token: 'new-token', expires_in: 5000 }
                    });
                }
                return Promise.reject(new Error('Unknown'));
            });

            const encToken = encrypt('old-token');
            const result = await instagramService.refreshAccessToken(encToken);
            expect(result).toBeDefined();
            expect(result?.accessToken).toBe('new-token');
        });

        test('should handle refresh token failure (decrypt fail)', async () => {
            const result = await instagramService.refreshAccessToken(''); // invalid enc
            expect(result).toBeNull();
        });

        test('should handle refresh token failure (api fail)', async () => {
            mockGet.mockRejectedValue(new Error('API Error'));
            const encToken = encrypt('old-token');
            const result = await instagramService.refreshAccessToken(encToken);
            expect(result).toBeNull();
        });

        test('should validate token success', async () => {
            mockGet.mockResolvedValue({ data: { id: 'user-123' } });
            const encToken = encrypt('valid-token');
            const isValid = await instagramService.validateToken(encToken);
            expect(isValid).toBe(true);
        });

        test('should validate token failure', async () => {
            mockGet.mockRejectedValue(new Error('Auth failed'));
            const encToken = encrypt('invalid');
            const isValid = await instagramService.validateToken(encToken);
            expect(isValid).toBe(false);
        });

        test('should validate token fail logic (decrypt)', async () => {
            const isValid = await instagramService.validateToken('');
            expect(isValid).toBe(false);
        });

        test('should handle rate limit error during token refresh', async () => {
            // Simulate Meta rate limit error (code 4)
            const rateLimitError: any = new Error('Rate limited');
            rateLimitError.response = {
                status: 429,
                data: {
                    error: {
                        code: 4,
                        message: 'Application request limit reached'
                    }
                }
            };
            mockGet.mockRejectedValue(rateLimitError);

            const encToken = encrypt('valid-token');
            const result = await instagramService.refreshAccessToken(encToken);
            expect(result).toBeNull();
        });

        test('should handle default expires_in when not provided', async () => {
            mockGet.mockImplementation((url: any, config: any) => {
                if (config?.params?.grant_type === 'fb_exchange_token') {
                    return Promise.resolve({
                        data: { access_token: 'new-token' } // No expires_in
                    });
                }
                return Promise.reject(new Error('Unknown'));
            });

            const encToken = encrypt('old-token');
            const result = await instagramService.refreshAccessToken(encToken);
            expect(result).toBeDefined();
            expect(result?.accessToken).toBe('new-token');
            // Should use default 60 days expiry
            expect(result?.expiresAt).toBeDefined();
        });
    });

    describe('Profile & Credentials', () => {
        test('getInstagramProfile success', async () => {
            mockGet.mockResolvedValue({
                data: { id: 'ig-123', username: 'test', followers_count: 100 }
            });
            const encToken = encrypt('token');
            const profile = await instagramService.getInstagramProfile(encToken, 'ig-123');
            expect(profile).toBeDefined();
            expect(profile.username).toBe('test');
        });

        test('getInstagramProfile failure (decrypt)', async () => {
            const profile = await instagramService.getInstagramProfile('', 'ig-123');
            expect(profile).toBeNull();
        });

        test('getInstagramProfile failure (api)', async () => {
            mockGet.mockRejectedValue(new Error('API Error'));
            const encToken = encrypt('token');
            const profile = await instagramService.getInstagramProfile(encToken, 'ig-123');
            expect(profile).toBeNull();
        });

        test('prepareCredentialsForStorage', () => {
            const account = {
                id: 'ig-123',
                username: 'my_ig',
                name: 'My IG',
                profilePictureUrl: 'http://pic',
                pageId: 'page-123',
                pageName: 'Page Name'
            };
            const now = new Date();
            const stored = instagramService.prepareCredentialsForStorage(account, 'my-token', now);

            expect(stored.userId).toBe('ig-123');
            expect(decrypt(stored.accessToken)).toBe('my-token');
            expect(stored.tokenExpiresAt).toBe(now);
        });
    });

    describe('Error Handling (parseMetaApiError)', () => {
        test('should handle permission validation error', async () => {
            const { state } = instagramService.generateOAuthUrl('res-perm-err');

            mockGet.mockImplementation((url: any) => {
                if (url.includes('oauth/access_token')) return Promise.resolve({ data: { access_token: 't', expires_in: 100 } });
                // Permissions endpoint fails
                if (url.includes('/me/permissions')) {
                    return Promise.reject(new Error('Permission check failed'));
                }
                return Promise.resolve({ data: {} });
            });

            const result = await instagramService.handleOAuthCallback('code-123', state);
            expect(result.success).toBe(false);
            expect(result.error).toBe('PERMISSIONS_MISSING');
        });

        test('should handle Meta API error with code', async () => {
            const { state } = instagramService.generateOAuthUrl('res-meta-err');

            mockGet.mockImplementation((url: any) => {
                if (url.includes('oauth/access_token')) return Promise.resolve({ data: { access_token: 't', expires_in: 100 } });
                if (url.includes('/me/permissions')) {
                    return Promise.resolve({
                        data: {
                            data: ['instagram_basic', 'pages_show_list', 'pages_read_engagement'].map(p => ({ permission: p, status: 'granted' }))
                        }
                    });
                }
                if (url.includes('/me/accounts')) {
                    // Simulate Meta error with code
                    const metaError: any = new Error('Meta error');
                    metaError.response = {
                        data: {
                            error: {
                                code: 190,
                                message: 'Invalid OAuth access token'
                            }
                        }
                    };
                    return Promise.reject(metaError);
                }
                return Promise.resolve({ data: {} });
            });

            const result = await instagramService.handleOAuthCallback('code-123', state);
            expect(result.success).toBe(false);
            expect(result.error).toBe('NO_PAGES_FOUND');
        });
    });
});
