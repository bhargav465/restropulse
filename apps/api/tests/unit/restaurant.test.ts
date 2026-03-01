import { describe, test, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Define Mocks
const mockFindRestaurantById = vi.fn();
const mockUpdateRestaurant = vi.fn();
const mockAddOffer = vi.fn();
const mockRemoveOffer = vi.fn();
const mockAddSpecial = vi.fn();
const mockRemoveSpecial = vi.fn();
const mockUpdateMenuTimestamp = vi.fn();
const mockFindRestaurantsWithInstagram = vi.fn();
const mockUpdateInstagramCredentials = vi.fn();
const mockRemoveInstagramCredentials = vi.fn();

// Mock Module - keep real collection getters, override restaurant helper functions
vi.mock('@restropulse/db', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
        findRestaurantById: mockFindRestaurantById,
        updateRestaurant: mockUpdateRestaurant,
        addOffer: mockAddOffer,
        removeOffer: mockRemoveOffer,
        addSpecial: mockAddSpecial,
        removeSpecial: mockRemoveSpecial,
        updateMenuTimestamp: mockUpdateMenuTimestamp,
        findRestaurantsWithInstagram: mockFindRestaurantsWithInstagram,
        updateInstagramCredentials: mockUpdateInstagramCredentials,
        removeInstagramCredentials: mockRemoveInstagramCredentials
    };
});

// Import actual implementation using vi.importActual to get real implementations
let actualRestaurantsDb: any;

// Import Helpers
const { createTestApp, mockRestaurant } = await import('../helpers/testHelper.js');
const { getRestaurantsCollection } = await import('@restropulse/db');

// Reset Helper
const useActualImplementation = async () => {
    if (!actualRestaurantsDb) {
        actualRestaurantsDb = await vi.importActual('@restropulse/db');
    }
    mockFindRestaurantById.mockImplementation(actualRestaurantsDb.findRestaurantById);
    mockUpdateRestaurant.mockImplementation(actualRestaurantsDb.updateRestaurant);
    mockAddOffer.mockImplementation(actualRestaurantsDb.addOffer);
    mockRemoveOffer.mockImplementation(actualRestaurantsDb.removeOffer);
    mockAddSpecial.mockImplementation(actualRestaurantsDb.addSpecial);
    mockRemoveSpecial.mockImplementation(actualRestaurantsDb.removeSpecial);
    mockUpdateMenuTimestamp.mockImplementation(actualRestaurantsDb.updateMenuTimestamp);
    mockFindRestaurantsWithInstagram.mockImplementation(actualRestaurantsDb.findRestaurantsWithInstagram);
    mockUpdateInstagramCredentials.mockImplementation(actualRestaurantsDb.updateInstagramCredentials);
    mockRemoveInstagramCredentials.mockImplementation(actualRestaurantsDb.removeInstagramCredentials);
};

const app = createTestApp();

describe('Restaurant Routes - Unit Tests', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        await useActualImplementation();
        // Reset restaurant state in memory DB
        const col = getRestaurantsCollection();
        await col.updateOne(
            { _id: 'r1' as any },
            { $set: mockRestaurant },
            { upsert: true }
        );
    });

    describe('GET /api/restaurant/:id', () => {
        it('should get restaurant by valid ID', async () => {
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

        it('should return 404 for non-existent restaurant', async () => {
            const response = await request(app)
                .get('/api/restaurant/invalid-id');

            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('success', false);
            expect(response.body).toHaveProperty('error', 'Restaurant not found');
        });

        it('should return complete restaurant data structure', async () => {
            const response = await request(app)
                .get('/api/restaurant/r1');

            expect(response.body.data).toHaveProperty('location');
            expect(response.body.data).toHaveProperty('accountManager');
            expect(response.body.data).toHaveProperty('subscription');
            expect(response.body.data).toHaveProperty('integrations');
        });

        it('should handle database error', async () => {
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
        it('should update restaurant with valid data', async () => {
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

        it('should return 404 for non-existent restaurant', async () => {
            const response = await request(app)
                .put('/api/restaurant/invalid-id')
                .send({ name: 'Test' });

            expect(response.status).toBe(404);
            expect(response.body.success).toBe(false);
        });

        it('should preserve ID when updating', async () => {
            const response = await request(app)
                .put('/api/restaurant/r1')
                .send({ id: 'different-id', name: 'Test' });

            expect(response.body.data.id).toBe('r1');
        });

        it('should handle partial updates', async () => {
            const response = await request(app)
                .put('/api/restaurant/r1')
                .send({ cuisine: 'Only Cuisine Update' });

            expect(response.status).toBe(200);
            expect(response.body.data.cuisine).toBe('Only Cuisine Update');
        });

        it('should handle database error', async () => {
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
        it('should delete offer as first action', async () => {
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

        it('should add new offer', async () => {
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

        it('should delete offer by index', async () => {
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

        it('should reject invalid action with 400 error', async () => {
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

        it('should reject missing payload for ADD with 400 error', async () => {
            const response = await request(app)
                .patch('/api/restaurant/r1/offers')
                .send({
                    action: 'ADD'
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('must be a string');
        });

        it('should reject non-string payload for ADD with 400 error', async () => {
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

        it('should reject non-number payload for DELETE with 400 error', async () => {
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

        it('should handle ADD when offers array is empty', async () => {
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

        it('should handle DELETE when offers array is empty', async () => {
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

        it('should handle restaurant not found during ADD', async () => {
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

        it('should handle database error during ADD', async () => {
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
        it('should reject invalid action for specials with 400 error', async () => {
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

        it('should add new chef special', async () => {
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

        it('should delete chef special by index', async () => {
            const response = await request(app)
                .patch('/api/restaurant/r1/specials')
                .send({
                    action: 'DELETE',
                    payload: 0
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        });

        it('should return updated restaurant data', async () => {
            const response = await request(app)
                .patch('/api/restaurant/r1/specials')
                .send({
                    action: 'ADD',
                    payload: 'Test Special'
                });

            expect(response.body).toHaveProperty('data');
            expect(response.body.data).toHaveProperty('chefSpecials');
        });

        it('should reject non-string payload for ADD special with 400 error', async () => {
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

        it('should reject non-number payload for DELETE special with 400 error', async () => {
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

        it('should handle ADD when specials array is empty', async () => {
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

        it('should handle DELETE when specials array is empty', async () => {
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

        it('should handle restaurant not found during ADD', async () => {
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

        it('should handle database error during ADD', async () => {
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
        it('should update menu timestamp', async () => {
            const response = await request(app)
                .patch('/api/restaurant/r1/menu');

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.menuLastUpdated).toBeDefined();
            expect(response.body).toHaveProperty('message', 'Menu updated successfully');
        });

        it('should set current date as menu update date', async () => {
            const response = await request(app)
                .patch('/api/restaurant/r1/menu');

            const today = new Date().toISOString().split('T')[0];
            expect(response.body.data.menuLastUpdated).toBe(today);
        });

        it('should handle restaurant not found', async () => {
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

        it('should handle database error', async () => {
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

    describe('DB Helpers - Instagram Functions', () => {
        test('findRestaurantsWithInstagram should return restaurants with credentials', async () => {
            // Add Instagram credentials to r1
            const col = getRestaurantsCollection();
            await col.updateOne(
                { _id: 'r1' as any },
                {
                    $set: {
                        instagramCredentials: {
                            accessToken: 'encrypted_token',
                            userId: 'ig_user_123',
                            username: '@testrestaurant',
                            pageId: 'page_123',
                            instagramBusinessAccountId: 'ig_123',
                            scopes: ['instagram_basic', 'pages_read_engagement'],
                            connectedAt: new Date(),
                            tokenExpiresAt: new Date(Date.now() + 60 * 86400000)
                        }
                    }
                }
            );

            const result = await actualRestaurantsDb.findRestaurantsWithInstagram();

            expect(result).toBeInstanceOf(Array);
            expect(result.length).toBeGreaterThan(0);
            // toApiFormat transforms instagramCredentials to instagramConnection
            expect(result[0]).toHaveProperty('instagramConnection');
            expect(result[0].instagramConnection.username).toBe('@testrestaurant');
            expect(result[0].instagramConnection.connected).toBe(true);
        });

        test('findRestaurantsWithInstagram should not return restaurants without credentials', async () => {
            const col = getRestaurantsCollection();
            await col.updateOne(
                { _id: 'r1' as any },
                { $unset: { instagramCredentials: '' } }
            );

            const result = await actualRestaurantsDb.findRestaurantsWithInstagram();

            expect(result).toBeInstanceOf(Array);
            expect(result.length).toBe(0);
        });

        test('updateInstagramCredentials should set credentials', async () => {
            const credentials = {
                accessToken: 'encrypted_new_token',
                userId: 'ig_user_456',
                username: '@newrestaurant',
                pageId: 'page_456',
                instagramBusinessAccountId: 'ig_456',
                scopes: ['instagram_basic', 'instagram_content_publish'],
                connectedAt: new Date(),
                tokenExpiresAt: new Date(Date.now() + 60 * 86400000)
            };

            const result = await actualRestaurantsDb.updateInstagramCredentials('r1', credentials);

            expect(result).toBeTruthy();
            // toApiFormat transforms instagramCredentials to instagramConnection
            expect(result!.instagramConnection).toBeDefined();
            expect(result!.instagramConnection.username).toBe('@newrestaurant');
            expect(result!.integrations.instagram).toBe(true);
        });

        test('updateInstagramCredentials should return null for non-existent restaurant', async () => {
            const credentials = {
                accessToken: 'token',
                userId: 'user',
                username: '@test',
                pageId: 'page',
                instagramBusinessAccountId: 'ig',
                scopes: [],
                connectedAt: new Date(),
                tokenExpiresAt: new Date()
            };

            const result = await actualRestaurantsDb.updateInstagramCredentials('nonexistent', credentials);

            expect(result).toBeNull();
        });

        test('removeInstagramCredentials should unset credentials', async () => {
            // First add credentials
            const col = getRestaurantsCollection();
            await col.updateOne(
                { _id: 'r1' as any },
                {
                    $set: {
                        instagramCredentials: {
                            accessToken: 'encrypted_token',
                            userId: 'ig_user',
                            username: '@test',
                            pageId: 'page',
                            instagramBusinessAccountId: 'ig',
                            scopes: [],
                            connectedAt: new Date(),
                            tokenExpiresAt: new Date()
                        },
                        'integrations.instagram': true
                    }
                }
            );

            const result = await actualRestaurantsDb.removeInstagramCredentials('r1');

            expect(result).toBeTruthy();
            // toApiFormat removes instagramCredentials entirely when it doesn't exist
            expect(result!.instagramConnection).toBeUndefined();
            expect(result!.integrations.instagram).toBe(false);
        });

        test('removeInstagramCredentials should return null for non-existent restaurant', async () => {
            const result = await actualRestaurantsDb.removeInstagramCredentials('nonexistent');

            expect(result).toBeNull();
        });
    });
});
