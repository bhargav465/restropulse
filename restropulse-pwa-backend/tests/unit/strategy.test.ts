import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

// Import Actual Implementation
import * as actualStrategyDb from '../../src/db/strategy.js';

// Define Mock Functions
const mockFindContentStrategy = jest.fn<any>();
const mockUpdateContentStrategy = jest.fn<any>();
const mockFindAllCycles = jest.fn<any>();
const mockFindCycleById = jest.fn<any>();
const mockCreateCycle = jest.fn<any>();
const mockUpdateCycle = jest.fn<any>();

// Mock the module
await jest.unstable_mockModule('../../src/db/strategy.js', () => ({
    // Retain other exports if any (though we are mocking all)
    __esModule: true, // Specific for ESM interop in Jest
    ...actualStrategyDb,
    findContentStrategy: mockFindContentStrategy,
    updateContentStrategy: mockUpdateContentStrategy,
    findAllCycles: mockFindAllCycles,
    findCycleById: mockFindCycleById,
    createCycle: mockCreateCycle,
    updateCycle: mockUpdateCycle
}));

// Helper to reset to actual implementation
const useActualImplementation = () => {
    mockFindContentStrategy.mockImplementation(actualStrategyDb.findContentStrategy);
    mockUpdateContentStrategy.mockImplementation(actualStrategyDb.updateContentStrategy);
    mockFindAllCycles.mockImplementation(actualStrategyDb.findAllCycles);
    mockFindCycleById.mockImplementation(actualStrategyDb.findCycleById);
    mockCreateCycle.mockImplementation(actualStrategyDb.createCycle);
    mockUpdateCycle.mockImplementation(actualStrategyDb.updateCycle);
};

// Dynamic Import of Test Helper
const { createTestApp, mockStrategyCycle } = await import('../helpers/testHelper.js');

const app = createTestApp();

describe('Strategy Routes - Unit Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        useActualImplementation();
    });

    describe('GET /api/strategy', () => {
        test('should get content strategy', async () => {
            const response = await request(app)
                .get('/api/strategy');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('data');
        });

        test('should return strategy with correct structure', async () => {
            const response = await request(app)
                .get('/api/strategy');

            expect(response.body.data).toHaveProperty('postsPerWeek');
            expect(response.body.data).toHaveProperty('focusCategories');
            expect(response.body.data).toHaveProperty('bestTime');
            expect(response.body.data).toHaveProperty('theme');
        });

        test('should return array for focusCategories', async () => {
            const response = await request(app)
                .get('/api/strategy');

            expect(Array.isArray(response.body.data.focusCategories)).toBe(true);
        });

        test('should handle database error', async () => {
            mockFindContentStrategy.mockRejectedValue(new Error('DB Error'));

            const response = await request(app).get('/api/strategy');

            expect(response.status).toBe(500);
            expect(response.body).toEqual({
                success: false,
                error: 'Internal server error'
            });
        });

        test('should return default strategy if none exists', async () => {
            mockFindContentStrategy.mockResolvedValue(null);

            const response = await request(app).get('/api/strategy');

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.id).toBe('default');
            expect(response.body.data.postsPerWeek).toBe(5);
        });
    });

    describe('PUT /api/strategy', () => {
        test('should update content strategy', async () => {
            const updateData = {
                postsPerWeek: 7,
                theme: 'Updated Theme'
            };

            const response = await request(app)
                .put('/api/strategy')
                .send(updateData);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.postsPerWeek).toBe(7);
            expect(response.body.data.theme).toBe('Updated Theme');
        });

        test('should handle partial updates', async () => {
            const response = await request(app)
                .put('/api/strategy')
                .send({ postsPerWeek: 10 });

            expect(response.status).toBe(200);
            expect(response.body.data.postsPerWeek).toBe(10);
        });

        test('should update focusCategories array', async () => {
            const newCategories = ['Videos', 'Stories', 'Reels'];
            const response = await request(app)
                .put('/api/strategy')
                .send({ focusCategories: newCategories });

            expect(response.body.data.focusCategories).toEqual(newCategories);
        });

        test('should return success message', async () => {
            const response = await request(app)
                .put('/api/strategy')
                .send({ bestTime: '7:00 PM - 9:00 PM' });

            expect(response.body).toHaveProperty('message', 'Content strategy updated successfully');
        });

        test('should handle database error', async () => {
            mockUpdateContentStrategy.mockRejectedValue(new Error('Update Error'));

            const response = await request(app)
                .put('/api/strategy')
                .send({ postsPerWeek: 5 });

            expect(response.status).toBe(500);
            expect(response.body).toEqual({
                success: false,
                error: 'Internal server error'
            });
        });
    });

    describe('GET /api/strategy/cycles', () => {
        test('should get all strategy cycles', async () => {
            const response = await request(app)
                .get('/api/strategy/cycles');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        test('should return cycles with correct structure', async () => {
            const response = await request(app)
                .get('/api/strategy/cycles');

            if (response.body.data.length > 0) {
                const cycle = response.body.data[0];
                expect(cycle).toHaveProperty('id');
                expect(cycle).toHaveProperty('period');
                expect(cycle).toHaveProperty('status');
                expect(cycle).toHaveProperty('summary');
                expect(cycle).toHaveProperty('plannedPosts');
                expect(cycle).toHaveProperty('focus');
            }
        });

        test('should handle database error', async () => {
            mockFindAllCycles.mockRejectedValue(new Error('DB Error'));

            const response = await request(app).get('/api/strategy/cycles');

            expect(response.status).toBe(500);
            expect(response.body).toEqual({
                success: false,
                error: 'Internal server error'
            });
        });
    });

    describe('GET /api/strategy/cycles/:id', () => {
        test('should get cycle by valid ID', async () => {
            const response = await request(app)
                .get('/api/strategy/cycles/sc1');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body.data).toHaveProperty('id', 'sc1');
        });

        test('should return 404 for non-existent cycle', async () => {
            const response = await request(app)
                .get('/api/strategy/cycles/non-existent');

            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('success', false);
            expect(response.body).toHaveProperty('error', 'Strategy cycle not found');
        });

        test('should return complete cycle data', async () => {
            const response = await request(app)
                .get('/api/strategy/cycles/sc1');

            expect(response.body.data).toHaveProperty('startDate');
            expect(response.body.data).toHaveProperty('endDate');
            expect(response.body.data).toHaveProperty('plannedPosts');
            expect(Array.isArray(response.body.data.plannedPosts)).toBe(true);
        });

        test('should handle database error', async () => {
            mockFindCycleById.mockRejectedValue(new Error('DB Error'));

            const response = await request(app).get('/api/strategy/cycles/123');

            expect(response.status).toBe(500);
            expect(response.body).toEqual({
                success: false,
                error: 'Internal server error'
            });
        });
    });

    describe('POST /api/strategy/cycles', () => {
        test('should create new strategy cycle', async () => {
            const newCycle = {
                period: 'July 2024',
                startDate: '2024-07-01',
                endDate: '2024-07-31',
                status: 'PENDING_APPROVAL',
                summary: 'New cycle for July',
                plannedPosts: [
                    { category: 'Images', count: 10 },
                    { category: 'Videos', count: 5 }
                ],
                focus: ['Summer Campaign', 'Outdoor Dining']
            };

            const response = await request(app)
                .post('/api/strategy/cycles')
                .send(newCycle);

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body.data).toHaveProperty('id');
            expect(response.body.data.period).toBe(newCycle.period);
            expect(response.body.data.summary).toBe(newCycle.summary);
        });

        test('should auto-generate ID for new cycle', async () => {
            const newCycle = {
                period: 'August 2024',
                startDate: '2024-08-01',
                endDate: '2024-08-31',
                status: 'ACTIVE',
                summary: 'August cycle',
                plannedPosts: [],
                focus: []
            };

            const response = await request(app)
                .post('/api/strategy/cycles')
                .send(newCycle);

            expect(response.body.data).toHaveProperty('id');
            // MongoDB generates ObjectId strings (24 hex chars)
            expect(response.body.data.id).toMatch(/^[a-f0-9]{24}$/);
        });

        test('should handle cycle with feedback', async () => {
            const newCycle = {
                period: 'September 2024',
                startDate: '2024-09-01',
                endDate: '2024-09-30',
                status: 'CHANGES_REQUESTED',
                summary: 'September cycle',
                plannedPosts: [],
                focus: [],
                feedback: 'Please add more video content'
            };

            const response = await request(app)
                .post('/api/strategy/cycles')
                .send(newCycle);

            expect(response.status).toBe(201);
            expect(response.body.data.feedback).toBe(newCycle.feedback);
        });

        test('should return success message', async () => {
            const newCycle = {
                period: 'Test Period',
                startDate: '2024-10-01',
                endDate: '2024-10-31',
                status: 'ACTIVE',
                summary: 'Test',
                plannedPosts: [],
                focus: []
            };

            const response = await request(app)
                .post('/api/strategy/cycles')
                .send(newCycle);

            expect(response.body).toHaveProperty('message', 'Strategy cycle created successfully');
        });

        test('should handle database error', async () => {
            mockCreateCycle.mockRejectedValue(new Error('Create Error'));

            const response = await request(app)
                .post('/api/strategy/cycles')
                .send({
                    period: 'Test Period',
                    startDate: '2024-01-01',
                    endDate: '2024-01-31'
                });

            expect(response.status).toBe(500);
            expect(response.body).toEqual({
                success: false,
                error: 'Internal server error'
            });
        });
    });

    describe('PUT /api/strategy/cycles/:id', () => {
        test('should update existing cycle', async () => {
            const updateData = {
                summary: 'Updated summary',
                status: 'APPROVED'
            };

            const response = await request(app)
                .put('/api/strategy/cycles/sc1')
                .send(updateData);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.summary).toBe(updateData.summary);
            expect(response.body.data.status).toBe(updateData.status);
        });

        test('should return 404 for non-existent cycle', async () => {
            const response = await request(app)
                .put('/api/strategy/cycles/non-existent')
                .send({ summary: 'test' });

            expect(response.status).toBe(404);
            expect(response.body.success).toBe(false);
        });

        test('should preserve cycle ID when updating', async () => {
            const response = await request(app)
                .put('/api/strategy/cycles/sc1')
                .send({ id: 'different-id', summary: 'test' });

            expect(response.body.data.id).toBe('sc1');
        });

        test('should update plannedPosts array', async () => {
            const newPlannedPosts = [
                { category: 'Stories', count: 20 },
                { category: 'Reels', count: 15 }
            ];

            const response = await request(app)
                .put('/api/strategy/cycles/sc1')
                .send({ plannedPosts: newPlannedPosts });

            expect(response.body.data.plannedPosts).toEqual(newPlannedPosts);
        });

        test('should update focus array', async () => {
            const newFocus = ['New Focus 1', 'New Focus 2'];

            const response = await request(app)
                .put('/api/strategy/cycles/sc1')
                .send({ focus: newFocus });

            expect(response.body.data.focus).toEqual(newFocus);
        });

        test('should handle feedback updates', async () => {
            const response = await request(app)
                .put('/api/strategy/cycles/sc1')
                .send({ feedback: 'Looks great, approved!' });

            expect(response.body.data.feedback).toBe('Looks great, approved!');
        });

        test('should handle database error', async () => {
            mockUpdateCycle.mockRejectedValue(new Error('Update Error'));

            const response = await request(app)
                .put('/api/strategy/cycles/123')
                .send({ period: 'Updated Period' });

            expect(response.status).toBe(500);
            expect(response.body).toEqual({
                success: false,
                error: 'Internal server error'
            });
        });
    });

    describe('Edge Cases', () => {
        test('should handle empty plannedPosts array', async () => {
            const newCycle = {
                period: 'Test',
                startDate: '2024-11-01',
                endDate: '2024-11-30',
                status: 'ACTIVE',
                summary: 'Test',
                plannedPosts: [],
                focus: []
            };

            const response = await request(app)
                .post('/api/strategy/cycles')
                .send(newCycle);

            expect(response.status).toBe(201);
            expect(response.body.data.plannedPosts).toEqual([]);
        });

        test('should handle empty focus array', async () => {
            const newCycle = {
                period: 'Test',
                startDate: '2024-11-01',
                endDate: '2024-11-30',
                status: 'ACTIVE',
                summary: 'Test',
                plannedPosts: [],
                focus: []
            };

            const response = await request(app)
                .post('/api/strategy/cycles')
                .send(newCycle);

            expect(response.status).toBe(201);
            expect(response.body.data.focus).toEqual([]);
        });
    });
});
