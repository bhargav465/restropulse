import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

// Import Actual Implementation
import * as actualRestaurantsDb from '../../src/db/restaurants.js';

// Define Mocks
const mockFindRestaurantById = jest.fn<any>();
const mockUpdateRestaurant = jest.fn<any>();
const mockAddOffer = jest.fn<any>();
const mockRemoveOffer = jest.fn<any>();
const mockAddSpecial = jest.fn<any>();
const mockRemoveSpecial = jest.fn<any>();
const mockUpdateMenuTimestamp = jest.fn<any>();

// Mock Module
await jest.unstable_mockModule('../../src/db/restaurants.js', () => ({
    __esModule: true,
    ...actualRestaurantsDb,
    findRestaurantById: mockFindRestaurantById,
    updateRestaurant: mockUpdateRestaurant,
    addOffer: mockAddOffer,
    removeOffer: mockRemoveOffer,
    addSpecial: mockAddSpecial,
    removeSpecial: mockRemoveSpecial,
    updateMenuTimestamp: mockUpdateMenuTimestamp
}));

// Import Helpers
const { createTestApp, mockRestaurant } = await import('../helpers/testHelper.js');
const { getRestaurantsCollection } = await import('../../src/db/connection.js');

// Reset Helper
const useActualImplementation = () => {
    mockFindRestaurantById.mockImplementation(actualRestaurantsDb.findRestaurantById);
    mockUpdateRestaurant.mockImplementation(actualRestaurantsDb.updateRestaurant);
    mockAddOffer.mockImplementation(actualRestaurantsDb.addOffer);
    mockRemoveOffer.mockImplementation(actualRestaurantsDb.removeOffer);
    mockAddSpecial.mockImplementation(actualRestaurantsDb.addSpecial);
    mockRemoveSpecial.mockImplementation(actualRestaurantsDb.removeSpecial);
    mockUpdateMenuTimestamp.mockImplementation(actualRestaurantsDb.updateMenuTimestamp);
};

const app = createTestApp();

describe('Restaurant Routes - Unit Tests', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        useActualImplementation();
        // Reset restaurant state in memory DB
        const col = getRestaurantsCollection();
        await col.updateOne(
            { _id: 'r1' as any },
            { $set: mockRestaurant },
            { upsert: true }
        );
    });

    describe('GET /api/restaurant/:id', () => {
        test('should get restaurant by valid ID', async () => {
            const response = await request(app)
                .get('/api/restaurant/r1');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('data');
            expect(response.body.data).toMatchObject({
                id: 'r1',
                name: mockRestaurant.name,
                cuisine: mockRestaurant.cuisine
            });
        });

        test('should return 404 for non-existent restaurant', async () => {
            const response = await request(app)
                .get('/api/restaurant/invalid-id');

            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('success', false);
            expect(response.body).toHaveProperty('error', 'Restaurant not found');
        });

        test('should return complete restaurant data structure', async () => {
            const response = await request(app)
                .get('/api/restaurant/r1');

            expect(response.body.data).toHaveProperty('location');
            expect(response.body.data).toHaveProperty('accountManager');
            expect(response.body.data).toHaveProperty('subscription');
            expect(response.body.data).toHaveProperty('integrations');
        });

        test('should handle database error', async () => {
            mockFindRestaurantById.mockRejectedValue(new Error('DB Error'));

            const response = await request(app)
                .get('/api/restaurant/r1');

            expect(response.status).toBe(500);
            expect(response.body).toEqual({
                success: false,
                error: 'Internal server error'
            });
        });
    });

    describe('PUT /api/restaurant/:id', () => {
        test('should update restaurant with valid data', async () => {
            const updateData = {
                name: 'Updated Restaurant Name',
                cuisine: 'Updated Cuisine'
            };

            const response = await request(app)
                .put('/api/restaurant/r1')
                .send(updateData);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body.data.name).toBe(updateData.name);
            expect(response.body.data.cuisine).toBe(updateData.cuisine);
            expect(response.body.data.id).toBe('r1');
        });

        test('should return 404 for non-existent restaurant', async () => {
            const response = await request(app)
                .put('/api/restaurant/invalid-id')
                .send({ name: 'Test' });

            expect(response.status).toBe(404);
            expect(response.body.success).toBe(false);
        });

        test('should preserve ID when updating', async () => {
            const response = await request(app)
                .put('/api/restaurant/r1')
                .send({ id: 'different-id', name: 'Test' });

            expect(response.body.data.id).toBe('r1');
        });

        test('should handle partial updates', async () => {
            const response = await request(app)
                .put('/api/restaurant/r1')
                .send({ cuisine: 'Only Cuisine Update' });

            expect(response.status).toBe(200);
            expect(response.body.data.cuisine).toBe('Only Cuisine Update');
        });

        test('should handle database error', async () => {
            mockUpdateRestaurant.mockRejectedValue(new Error('Update Error'));

            const response = await request(app)
                .put('/api/restaurant/r1')
                .send({ name: 'New Name' });

            expect(response.status).toBe(500);
            expect(response.body).toEqual({
                success: false,
                error: 'Internal server error'
            });
        });
    });

    describe('PATCH /api/restaurant/:id/offers', () => {
        test('should delete offer as first action', async () => {
            // First get current offers
            const getResponse = await request(app)
                .get('/api/restaurant/r1');

            const offersCount = getResponse.body.data.activeOffers?.length || 0;

            if (offersCount > 0) {
                const response = await request(app)
                    .patch('/api/restaurant/r1/offers')
                    .send({
                        action: 'DELETE',
                        payload: 0
                    });

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
            }
        });

        test('should add new offer', async () => {
            const response = await request(app)
                .patch('/api/restaurant/r1/offers')
                .send({
                    action: 'ADD',
                    payload: 'New Special Offer 50% Off'
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.activeOffers).toContain('New Special Offer 50% Off');
        });

        test('should delete offer by index', async () => {
            const response = await request(app)
                .patch('/api/restaurant/r1/offers')
                .send({
                    action: 'DELETE',
                    payload: 0
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body).toHaveProperty('message', 'Offers updated successfully');
        });

        test('should reject invalid action with 400 error', async () => {
            const response = await request(app)
                .patch('/api/restaurant/r1/offers')
                .send({
                    action: 'INVALID',
                    payload: 'test'
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('Invalid action');
        });

        test('should reject missing payload for ADD with 400 error', async () => {
            const response = await request(app)
                .patch('/api/restaurant/r1/offers')
                .send({
                    action: 'ADD'
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('must be a string');
        });

        test('should reject non-string payload for ADD with 400 error', async () => {
            const response = await request(app)
                .patch('/api/restaurant/r1/offers')
                .send({
                    action: 'ADD',
                    payload: 123
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('must be a string');
        });

        test('should reject non-number payload for DELETE with 400 error', async () => {
            const response = await request(app)
                .patch('/api/restaurant/r1/offers')
                .send({
                    action: 'DELETE',
                    payload: 'not-a-number'
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('must be a number');
        });

        test('should handle ADD when offers array is empty', async () => {
            // First clear offers by updating restaurant
            await request(app)
                .put('/api/restaurant/r1')
                .send({
                    activeOffers: null
                });

            const response = await request(app)
                .patch('/api/restaurant/r1/offers')
                .send({
                    action: 'ADD',
                    payload: 'First Offer'
                });

            expect(response.status).toBe(200);
            expect(response.body.data.activeOffers).toContain('First Offer');
        });

        test('should handle DELETE when offers array is empty', async () => {
            // First clear offers
            await request(app)
                .put('/api/restaurant/r1')
                .send({
                    activeOffers: null
                });

            const response = await request(app)
                .patch('/api/restaurant/r1/offers')
                .send({
                    action: 'DELETE',
                    payload: 0
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        });

        test('should handle restaurant not found during ADD', async () => {
            mockAddOffer.mockResolvedValue(null);

            const response = await request(app)
                .patch('/api/restaurant/invalid-id/offers')
                .send({ action: 'ADD', payload: 'New Offer' });

            expect(response.status).toBe(404);
            expect(response.body).toEqual({
                success: false,
                error: 'Restaurant not found'
            });
        });

        test('should handle database error during ADD', async () => {
            mockAddOffer.mockRejectedValue(new Error('DB Error'));

            const response = await request(app)
                .patch('/api/restaurant/r1/offers')
                .send({ action: 'ADD', payload: 'New Offer' });

            expect(response.status).toBe(500);
            expect(response.body).toEqual({
                success: false,
                error: 'Internal server error'
            });
        });
    });

    describe('PATCH /api/restaurant/:id/specials', () => {
        test('should reject invalid action for specials with 400 error', async () => {
            const response = await request(app)
                .patch('/api/restaurant/r1/specials')
                .send({
                    action: 'INVALID',
                    payload: 'test'
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('Invalid action');
        });

        test('should add new chef special', async () => {
            const response = await request(app)
                .patch('/api/restaurant/r1/specials')
                .send({
                    action: 'ADD',
                    payload: 'Lobster Thermidor'
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.chefSpecials).toContain('Lobster Thermidor');
        });

        test('should delete chef special by index', async () => {
            const response = await request(app)
                .patch('/api/restaurant/r1/specials')
                .send({
                    action: 'DELETE',
                    payload: 0
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        });

        test('should return updated restaurant data', async () => {
            const response = await request(app)
                .patch('/api/restaurant/r1/specials')
                .send({
                    action: 'ADD',
                    payload: 'Test Special'
                });

            expect(response.body).toHaveProperty('data');
            expect(response.body.data).toHaveProperty('chefSpecials');
        });

        test('should reject non-string payload for ADD special with 400 error', async () => {
            const response = await request(app)
                .patch('/api/restaurant/r1/specials')
                .send({
                    action: 'ADD',
                    payload: 456
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('must be a string');
        });

        test('should reject non-number payload for DELETE special with 400 error', async () => {
            const response = await request(app)
                .patch('/api/restaurant/r1/specials')
                .send({
                    action: 'DELETE',
                    payload: 'not-a-number'
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('must be a number');
        });

        test('should handle ADD when specials array is empty', async () => {
            // First clear specials
            await request(app)
                .put('/api/restaurant/r1')
                .send({
                    chefSpecials: null
                });

            const response = await request(app)
                .patch('/api/restaurant/r1/specials')
                .send({
                    action: 'ADD',
                    payload: 'First Special'
                });

            expect(response.status).toBe(200);
            expect(response.body.data.chefSpecials).toContain('First Special');
        });

        test('should handle DELETE when specials array is empty', async () => {
            // First clear specials
            await request(app)
                .put('/api/restaurant/r1')
                .send({
                    chefSpecials: null
                });

            const response = await request(app)
                .patch('/api/restaurant/r1/specials')
                .send({
                    action: 'DELETE',
                    payload: 0
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        });

        test('should handle restaurant not found during ADD', async () => {
            mockAddSpecial.mockResolvedValue(null);

            const response = await request(app)
                .patch('/api/restaurant/invalid-id/specials')
                .send({ action: 'ADD', payload: 'Special Dish' });

            expect(response.status).toBe(404);
            expect(response.body).toEqual({
                success: false,
                error: 'Restaurant not found'
            });
        });

        test('should handle database error during ADD', async () => {
            mockAddSpecial.mockRejectedValue(new Error('DB Error'));

            const response = await request(app)
                .patch('/api/restaurant/r1/specials')
                .send({ action: 'ADD', payload: 'Special Dish' });

            expect(response.status).toBe(500);
            expect(response.body).toEqual({
                success: false,
                error: 'Internal server error'
            });
        });
    });

    describe('PATCH /api/restaurant/:id/menu', () => {
        test('should update menu timestamp', async () => {
            const response = await request(app)
                .patch('/api/restaurant/r1/menu');

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.menuLastUpdated).toBeDefined();
            expect(response.body).toHaveProperty('message', 'Menu updated successfully');
        });

        test('should set current date as menu update date', async () => {
            const response = await request(app)
                .patch('/api/restaurant/r1/menu');

            const today = new Date().toISOString().split('T')[0];
            expect(response.body.data.menuLastUpdated).toBe(today);
        });

        test('should handle restaurant not found', async () => {
            mockUpdateMenuTimestamp.mockResolvedValue(null);

            const response = await request(app)
                .patch('/api/restaurant/invalid-id/menu')
                .send({});

            expect(response.status).toBe(404);
            expect(response.body).toEqual({
                success: false,
                error: 'Restaurant not found'
            });
        });

        test('should handle database error', async () => {
            mockUpdateMenuTimestamp.mockRejectedValue(new Error('DB Error'));

            const response = await request(app)
                .patch('/api/restaurant/r1/menu')
                .send({});

            expect(response.status).toBe(500);
            expect(response.body).toEqual({
                success: false,
                error: 'Internal server error'
            });
        });
    });
});
