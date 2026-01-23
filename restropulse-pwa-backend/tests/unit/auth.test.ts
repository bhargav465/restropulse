import { describe, test, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import { createTestApp, mockUser, generateAuthToken } from '../helpers/testHelper.js';

const app = createTestApp();

describe('Auth Routes - Unit Tests', () => {
    describe('POST /api/auth/login', () => {
        test('should successfully login with valid credentials', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'arjun@spicelounge.com',
                    password: 'demo123'
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('user');
            expect(response.body).toHaveProperty('token');
            expect(response.body.user).toMatchObject({
                id: mockUser.id,
                email: mockUser.email,
                name: mockUser.name
            });
            expect(response.body.token).toMatch(/^mock-jwt-token-/);
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
            expect(response.body).toHaveProperty('message', 'Invalid credentials');
        });

        test('should fail login with missing password', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'arjun@spicelounge.com'
                });

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('success', false);
        });

        test('should fail login with missing email', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    password: 'demo123'
                });

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('success', false);
        });

        test('should fail login with empty request body', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({});

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('success', false);
        });

        test('should return proper content type', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'arjun@spicelounge.com',
                    password: 'demo123'
                });

            expect(response.headers['content-type']).toMatch(/json/);
        });
    });

    describe('POST /api/auth/logout', () => {
        test('should successfully logout', async () => {
            const response = await request(app)
                .post('/api/auth/logout');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('message', 'Logged out successfully');
        });

        test('should logout even without token', async () => {
            const response = await request(app)
                .post('/api/auth/logout');

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
            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('user');
            expect(response.body.user).toMatchObject({
                id: mockUser.id,
                email: mockUser.email
            });
        });

        test('should fail with invalid token', async () => {
            const response = await request(app)
                .get('/api/auth/session')
                .set('Authorization', 'Bearer invalid-token');

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('success', false);
            expect(response.body).toHaveProperty('message', 'No valid session');
        });

        test('should fail without authorization header', async () => {
            const response = await request(app)
                .get('/api/auth/session');

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('success', false);
        });

        test('should fail with malformed authorization header', async () => {
            const response = await request(app)
                .get('/api/auth/session')
                .set('Authorization', 'InvalidFormat');

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
        });
    });
});
