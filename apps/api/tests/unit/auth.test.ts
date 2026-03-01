import { describe, it, test, expect, vi, beforeEach, afterAll } from 'vitest';
import request from 'supertest';

// Define Mocks
const mockFindUserByEmail = vi.fn();
const mockFindUserByPhone = vi.fn();
const mockFindUserById = vi.fn();
const mockCreateUser = vi.fn();
const mockFindUserByFirebaseUid = vi.fn();
const mockUpdateUser = vi.fn();

const mockGenerateTokens = vi.fn();
const mockVerifyToken = vi.fn();
const mockRefreshAccessToken = vi.fn();

const mockVerifyFirebaseToken = vi.fn();

// Mock Modules - Vitest hoists these to the top
vi.mock('@restropulse/db', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
        findUserByEmail: mockFindUserByEmail,
        findUserByPhone: mockFindUserByPhone,
        findUserById: mockFindUserById,
        createUser: mockCreateUser,
        findUserByFirebaseUid: mockFindUserByFirebaseUid,
        updateUser: mockUpdateUser
    };
});

vi.mock('../../src/services/jwt.js', () => ({
    generateTokens: mockGenerateTokens,
    verifyToken: mockVerifyToken,
    refreshAccessToken: mockRefreshAccessToken
}));

vi.mock('../../src/services/firebase-admin.js', () => ({
    verifyFirebaseToken: mockVerifyFirebaseToken,
    isValidPhoneNumber: vi.fn(() => true),
    initializeFirebaseAdmin: vi.fn(),
    isFirebaseInitialized: vi.fn(() => true)
}));

// Import actual implementations USING vi.importActual to get real implementations
let actualUsersDb: any;
let actualJwt: any;

// Helper to use actual implementations
const useActualImplementation = async () => {
    if (!actualUsersDb) {
        actualUsersDb = await vi.importActual('@restropulse/db');
    }
    if (!actualJwt) {
        actualJwt = await vi.importActual('../../src/services/jwt.js');
    }

    mockFindUserByEmail.mockImplementation(actualUsersDb.findUserByEmail);
    mockFindUserByPhone.mockImplementation(actualUsersDb.findUserByPhone);
    mockFindUserById.mockImplementation(actualUsersDb.findUserById);
    mockCreateUser.mockImplementation(actualUsersDb.createUser);
    mockFindUserByFirebaseUid.mockImplementation(actualUsersDb.findUserByFirebaseUid);
    mockUpdateUser.mockImplementation(actualUsersDb.updateUser);

    mockGenerateTokens.mockImplementation(actualJwt.generateTokens);
    mockVerifyToken.mockImplementation(actualJwt.verifyToken);
    mockRefreshAccessToken.mockImplementation(actualJwt.refreshAccessToken);
};

// Initialize App
const { createTestApp, mockUser, generateAuthToken } = await import('../helpers/testHelper.js');
const app = createTestApp();

describe('Auth Routes - Combined Tests', () => {

    beforeEach(async () => {
        vi.clearAllMocks();
        await useActualImplementation();
    });

    describe('POST /api/auth/login', () => {
        it('should successfully login with valid credentials', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'arjun@spicelounge.com',
                    password: 'demo123' // Assuming this matches the seeded user
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('token');
        });

        it('should fail login with invalid email', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'wrong@email.com',
                    password: 'demo123'
                });

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('success', false);
        });

        it('should fail login with missing password', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({ email: 'arjun@spicelounge.com' });

            expect(response.status).toBe(400);
        });

        it('should handle DB error', async () => {
            mockFindUserByEmail.mockRejectedValue(new Error('DB Error'));
            const res = await request(app).post('/api/auth/login').send({ email: 'e@e.com', password: 'p' });
            expect(res.status).toBe(500);
        });
    });

    describe('POST /api/auth/logout', () => {
        it('should successfully logout', async () => {
            const response = await request(app).post('/api/auth/logout');
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        });
    });

    describe('GET /api/auth/session', () => {
        it('should return user with valid token', async () => {
            const token = generateAuthToken();
            const response = await request(app)
                .get('/api/auth/session')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.user.email).toBe(mockUser.email);
        });

        it('should fail with invalid token', async () => {
            const response = await request(app)
                .get('/api/auth/session')
                .set('Authorization', 'Bearer invalid-token');

            expect(response.status).toBe(401);
        });

        it('should handle user not found (token valid but user gone)', async () => {
            mockVerifyToken.mockReturnValue({ userId: 'u1', type: 'access' });
            mockFindUserById.mockResolvedValue(null);

            const res = await request(app)
                .get('/api/auth/session')
                .set('Authorization', 'Bearer valid');

            expect(res.status).toBe(401);
        });

        it('should handle db exception', async () => {
            mockVerifyToken.mockReturnValue({ userId: 'u1', type: 'access' });
            mockFindUserById.mockRejectedValue(new Error('DB Fail'));

            const res = await request(app)
                .get('/api/auth/session')
                .set('Authorization', 'Bearer valid');

            expect(res.status).toBe(500);
        });
    });

    describe('POST /api/auth/refresh', () => {
        it('should handle missing refresh token', async () => {
            const res = await request(app).post('/api/auth/refresh').send({});
            expect(res.status).toBe(400);
        });

        it('should handle invalid/expired refresh token', async () => {
            // Override local verification logic if needed, or rely on actual
            // Since we mocked `refreshAccessToken` service, we can control it.
            mockRefreshAccessToken.mockReturnValue(null);

            const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'bad' });
            expect(res.status).toBe(401);
        });

        it('should success on valid refresh token', async () => {
            mockRefreshAccessToken.mockReturnValue('new-at');
            const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'good' });
            expect(res.status).toBe(200);
            expect(res.body.token).toBe('new-at');
        });

        it('should handle exception', async () => {
            mockRefreshAccessToken.mockImplementation(() => { throw new Error('Refresh error'); });
            const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'good' });
            expect(res.status).toBe(500);
        });
    });

    describe('POST /api/auth/firebase', () => {
        it('should successfully login with valid firebase token', async () => {
            const mockFirebaseUser = { uid: 'firebase-123', phone_number: '+919876543210' };
            mockVerifyFirebaseToken.mockResolvedValue(mockFirebaseUser);

            const response = await request(app)
                .post('/api/auth/firebase')
                .send({ idToken: 'valid-firebase-token' });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        });

        it('should fail with invalid firebase token', async () => {
            mockVerifyFirebaseToken.mockResolvedValue(null);

            const response = await request(app)
                .post('/api/auth/firebase')
                .send({ idToken: 'invalid-token' });

            expect(response.status).toBe(401);
        });
    });

    describe('POST /api/auth/send-otp', () => {
        it('should send otp for valid phone (dev mode)', async () => {
            // Assuming NODE_ENV != production (setup.ts sets 'test')
            const response = await request(app)
                .post('/api/auth/send-otp')
                .send({ phone: '+919999988888' });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('devOtp');
        });


    });

    describe('POST /api/auth/verify-otp', () => {
        it('should verify valid OTP and login', async () => {
            const phone = '+919999988888';
            const sendResponse = await request(app).post('/api/auth/send-otp').send({ phone });
            const otp = sendResponse.body.devOtp;

            const verifyResponse = await request(app)
                .post('/api/auth/verify-otp')
                .send({ phone, otp });

            expect(verifyResponse.status).toBe(200);
            expect(verifyResponse.body).toHaveProperty('token');
        });

        it('should fail with invalid OTP', async () => {
            const phone = '+919999988888';
            await request(app).post('/api/auth/send-otp').send({ phone });

            const response = await request(app)
                .post('/api/auth/verify-otp')
                .send({ phone, otp: '000000' });

            expect(response.status).toBe(401);
        });

        it('should handle DB failure after OTP verification', async () => {
            const phone = '+919999955555';
            const sendRes = await request(app).post('/api/auth/send-otp').send({ phone });
            const otp = sendRes.body.devOtp;

            // Make next DB call fail
            // Note: verify-otp calls findUserByPhone
            mockFindUserByPhone.mockRejectedValueOnce(new Error('DB Error'));

            const verifyRes = await request(app).post('/api/auth/verify-otp').send({ phone, otp });
            expect(verifyRes.status).toBe(500);
        });
    });
});
