import { describe, test, expect, jest, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';

// 1. Import Actuals
import * as actualUsersDb from '../../src/db/users.js';
import * as actualJwt from '../../src/services/jwt.js';


// 2. Define Mocks
const mockFindUserByEmail = jest.fn<any>();
const mockFindUserByPhone = jest.fn<any>();
const mockFindUserById = jest.fn<any>();
const mockCreateUser = jest.fn<any>();
const mockFindUserByFirebaseUid = jest.fn<any>();
const mockUpdateUser = jest.fn<any>();

const mockGenerateTokens = jest.fn<any>();
const mockVerifyToken = jest.fn<any>();
const mockRefreshAccessToken = jest.fn<any>();

const mockVerifyFirebaseToken = jest.fn<any>();

// 3. Mock Modules

// DB Users - Pass-through pattern
await jest.unstable_mockModule('../../src/db/users.js', () => ({
    __esModule: true,
    ...actualUsersDb,
    findUserByEmail: mockFindUserByEmail,
    findUserByPhone: mockFindUserByPhone,
    findUserById: mockFindUserById,
    createUser: mockCreateUser,
    findUserByFirebaseUid: mockFindUserByFirebaseUid,
    updateUser: mockUpdateUser
}));

// JWT Service - Pass-through pattern
await jest.unstable_mockModule('../../src/services/jwt.js', () => ({
    __esModule: true,
    ...actualJwt,
    generateTokens: mockGenerateTokens,
    verifyToken: mockVerifyToken,
    refreshAccessToken: mockRefreshAccessToken
}));

// Firebase - Fully mocked (no real connection possible/desired)
await jest.unstable_mockModule('../../src/services/firebase-admin.js', () => ({
    verifyFirebaseToken: mockVerifyFirebaseToken,
    isValidPhoneNumber: jest.fn(() => true),
    initializeFirebaseAdmin: jest.fn(),
    isFirebaseInitialized: jest.fn(() => true)
}));

// 5. Helper to reset mocks
const useActualImplementation = () => {
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

// 5. Initialize App
const { createTestApp, mockUser, generateAuthToken } = await import('../helpers/testHelper.js');
const app = createTestApp();

describe('Auth Routes - Combined Tests', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        useActualImplementation();
    });

    describe('POST /api/auth/login', () => {
        test('should successfully login with valid credentials', async () => {
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

        test('should fail login with invalid email', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'wrong@email.com',
                    password: 'demo123'
                });

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('success', false);
        });

        test('should fail login with missing password', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({ email: 'arjun@spicelounge.com' });

            expect(response.status).toBe(400);
        });

        test('should handle DB error', async () => {
            mockFindUserByEmail.mockRejectedValue(new Error('DB Error'));
            const res = await request(app).post('/api/auth/login').send({ email: 'e@e.com', password: 'p' });
            expect(res.status).toBe(500);
        });
    });

    describe('POST /api/auth/logout', () => {
        test('should successfully logout', async () => {
            const response = await request(app).post('/api/auth/logout');
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        });
    });

    describe('GET /api/auth/session', () => {
        test('should return user with valid token', async () => {
            const token = generateAuthToken();
            const response = await request(app)
                .get('/api/auth/session')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.user.email).toBe(mockUser.email);
        });

        test('should fail with invalid token', async () => {
            const response = await request(app)
                .get('/api/auth/session')
                .set('Authorization', 'Bearer invalid-token');

            expect(response.status).toBe(401);
        });

        test('should handle user not found (token valid but user gone)', async () => {
            mockVerifyToken.mockReturnValue({ userId: 'u1', type: 'access' });
            mockFindUserById.mockResolvedValue(null);

            const res = await request(app)
                .get('/api/auth/session')
                .set('Authorization', 'Bearer valid');

            expect(res.status).toBe(401);
        });

        test('should handle db exception', async () => {
            mockVerifyToken.mockReturnValue({ userId: 'u1', type: 'access' });
            mockFindUserById.mockRejectedValue(new Error('DB Fail'));

            const res = await request(app)
                .get('/api/auth/session')
                .set('Authorization', 'Bearer valid');

            expect(res.status).toBe(500);
        });
    });

    describe('POST /api/auth/refresh', () => {
        test('should handle missing refresh token', async () => {
            const res = await request(app).post('/api/auth/refresh').send({});
            expect(res.status).toBe(400);
        });

        test('should handle invalid/expired refresh token', async () => {
            // Override local verification logic if needed, or rely on actual
            // Since we mocked `refreshAccessToken` service, we can control it.
            mockRefreshAccessToken.mockReturnValue(null);

            const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'bad' });
            expect(res.status).toBe(401);
        });

        test('should success on valid refresh token', async () => {
            mockRefreshAccessToken.mockReturnValue('new-at');
            const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'good' });
            expect(res.status).toBe(200);
            expect(res.body.token).toBe('new-at');
        });

        test('should handle exception', async () => {
            mockRefreshAccessToken.mockImplementation(() => { throw new Error('Refresh error'); });
            const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'good' });
            expect(res.status).toBe(500);
        });
    });

    describe('POST /api/auth/firebase', () => {
        test('should successfully login with valid firebase token', async () => {
            const mockFirebaseUser = { uid: 'firebase-123', phone_number: '+919876543210' };
            mockVerifyFirebaseToken.mockResolvedValue(mockFirebaseUser);

            const response = await request(app)
                .post('/api/auth/firebase')
                .send({ idToken: 'valid-firebase-token' });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        });

        test('should fail with invalid firebase token', async () => {
            mockVerifyFirebaseToken.mockResolvedValue(null);

            const response = await request(app)
                .post('/api/auth/firebase')
                .send({ idToken: 'invalid-token' });

            expect(response.status).toBe(401);
        });
    });

    describe('POST /api/auth/send-otp', () => {
        test('should send otp for valid phone (dev mode)', async () => {
            // Assuming NODE_ENV != production (setup.ts sets 'test')
            const response = await request(app)
                .post('/api/auth/send-otp')
                .send({ phone: '+919999988888' });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('devOtp');
        });


    });

    describe('POST /api/auth/verify-otp', () => {
        test('should verify valid OTP and login', async () => {
            const phone = '+919999988888';
            const sendResponse = await request(app).post('/api/auth/send-otp').send({ phone });
            const otp = sendResponse.body.devOtp;

            const verifyResponse = await request(app)
                .post('/api/auth/verify-otp')
                .send({ phone, otp });

            expect(verifyResponse.status).toBe(200);
            expect(verifyResponse.body).toHaveProperty('token');
        });

        test('should fail with invalid OTP', async () => {
            const phone = '+919999988888';
            await request(app).post('/api/auth/send-otp').send({ phone });

            const response = await request(app)
                .post('/api/auth/verify-otp')
                .send({ phone, otp: '000000' });

            expect(response.status).toBe(401);
        });

        test('should handle DB failure after OTP verification', async () => {
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
