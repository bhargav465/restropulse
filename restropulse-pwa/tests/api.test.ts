import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authAPI, restaurantAPI, postsAPI, strategyAPI } from '../api';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('API Service', () => {
    beforeEach(() => {
        mockFetch.mockClear();
        localStorage.clear();
    });

    describe('authAPI', () => {
        it('should login successfully', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true, token: 'test-token', data: { user: { id: 'u1', name: 'Test User' } } }),
            });

            const result = await authAPI.login({ email: 'test@test.com', password: 'password' });

            expect(result.success).toBe(true);
            expect(result.token).toBe('test-token');
        });

        it('should handle login failure', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                json: async () => ({ message: 'Invalid credentials' }),
            });

            await expect(authAPI.login({ email: 'wrong@test.com', password: 'wrong' }))
                .rejects.toThrow();
        });

        it('should logout successfully', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true }),
            });

            await authAPI.logout();

            expect(localStorage.removeItem).toHaveBeenCalledWith('rp_token');
        });

        it('should check session with valid token', async () => {
            localStorage.getItem = vi.fn().mockReturnValue('test-token');
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true, data: { user: { id: 'u1', name: 'Test' } } }),
            });

            const result = await authAPI.checkSession();

            expect(result.success).toBe(true);
            expect(result.data?.user).toBeDefined();
        });
    });

    describe('restaurantAPI', () => {
        it('should get restaurant by ID', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true, data: { id: 'r1', name: 'Test Restaurant' } }),
            });

            const result = await restaurantAPI.get('r1');

            expect(result.id).toBe('r1');
            expect(result.name).toBe('Test Restaurant');
        });

        it('should update restaurant', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true, data: { id: 'r1', name: 'Updated Restaurant' } }),
            });

            const result = await restaurantAPI.update('r1', { name: 'Updated Restaurant' });

            expect(result.name).toBe('Updated Restaurant');
        });

        it('should update offers', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true, data: { activeOffers: ['New Offer'] } }),
            });

            const result = await restaurantAPI.updateOffers('r1', 'ADD', 'New Offer');

            expect(result.activeOffers).toContain('New Offer');
        });

        it('should handle API errors', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                json: async () => ({ message: 'Restaurant not found' }),
            });

            await expect(restaurantAPI.get('invalid'))
                .rejects.toThrow();
        });
    });

    describe('postsAPI', () => {
        it('should get all posts', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true, data: [{ id: 'p1' }, { id: 'p2' }] }),
            });

            const result = await postsAPI.getAll();

            expect(result).toHaveLength(2);
        });

        it('should create a new post', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true, data: { id: 'p3', caption: 'New post' } }),
            });

            const result = await postsAPI.create({
                caption: 'New post',
                type: 'IMAGE',
                status: 'PENDING_APPROVAL',
                thumbnail: '/mock.jpg',
                platform: 'INSTAGRAM'
            });

            expect(result.caption).toBe('New post');
        });

        it('should update a post', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true, data: { id: 'p1', caption: 'Updated' } }),
            });

            const result = await postsAPI.update('p1', { caption: 'Updated' });

            expect(result.caption).toBe('Updated');
        });

        it('should delete a post', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true }),
            });

            await expect(postsAPI.delete('p1')).resolves.not.toThrow();
        });
    });

    describe('strategyAPI', () => {
        it('should get content strategy', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true, data: { postsPerWeek: 4 } }),
            });

            const result = await strategyAPI.getStrategy();

            expect(result.postsPerWeek).toBe(4);
        });

        it('should get all cycles', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true, data: [{ id: 'c1' }, { id: 'c2' }] }),
            });

            const result = await strategyAPI.getAllCycles();

            expect(result).toHaveLength(2);
        });

        it('should create a cycle', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true, data: { id: 'c3', period: 'New cycle' } }),
            });

            const result = await strategyAPI.createCycle({ period: 'New cycle' } as any);

            expect(result.period).toBe('New cycle');
        });
    });

    describe('Error Handling', () => {
        it('should handle network errors', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            await expect(authAPI.login({ email: 'test@test.com', password: 'pass' }))
                .rejects.toThrow();
        });

        it('should handle malformed JSON', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => { throw new Error('Invalid JSON'); },
            });

            await expect(restaurantAPI.get('r1'))
                .rejects.toThrow();
        });

        it('should handle HTTP error responses', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                json: async () => ({ message: 'Not found' }),
            });

            await expect(postsAPI.getById('invalid'))
                .rejects.toThrow('Not found');
        });

        it('should handle network error with no JSON response', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: async () => { throw new Error('Invalid JSON'); },
            });

            await expect(restaurantAPI.get('r1'))
                .rejects.toThrow();
        });
    });

    describe('Additional Coverage', () => {
        it('should update restaurant offers', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    success: true,
                    data: { id: 'r1', name: 'Updated Restaurant', activeOffers: ['New offer'] },
                }),
            });

            const result = await restaurantAPI.updateOffers('r1', 'ADD', 'New offer');

            expect(result.activeOffers).toContain('New offer');
        });

        it('should update restaurant specials', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    success: true,
                    data: { id: 'r1', name: 'Updated Restaurant', chefSpecials: ['New special'] },
                }),
            });

            const result = await restaurantAPI.updateSpecials('r1', 'ADD', 'New special');

            expect(result.chefSpecials).toContain('New special');
        });

        it('should update restaurant menu', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    success: true,
                    data: { id: 'r1', name: 'Updated Restaurant' },
                }),
            });

            const result = await restaurantAPI.updateMenu('r1');

            expect(result.id).toBe('r1');
        });

        it('should update strategy', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    success: true,
                    data: { postsPerWeek: 5, contentThemes: ['Food', 'Atmosphere'] },
                }),
            });

            const result = await strategyAPI.updateStrategy({ postsPerWeek: 5 });

            expect(result.postsPerWeek).toBe(5);
        });

        it('should get cycle by id', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    success: true,
                    data: { id: 'c1', period: '2024 Q1', goals: ['goal1'] },
                }),
            });

            const result = await strategyAPI.getCycleById('c1');

            expect(result.id).toBe('c1');
        });

        it('should update a cycle', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    success: true,
                    data: { id: 'c1', period: '2024 Q2 Updated', status: 'ACTIVE' },
                }),
            });

            const result = await strategyAPI.updateCycle('c1', { status: 'ACTIVE' });

            expect(result.status).toBe('ACTIVE');
        });

        it('should check session', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    success: true,
                    user: { id: 'u1', email: 'test@test.com' },
                }),
            });

            const result = await authAPI.checkSession();

            expect(result.success).toBe(true);
            expect(result.user).toBeDefined();
        });
    });
});
