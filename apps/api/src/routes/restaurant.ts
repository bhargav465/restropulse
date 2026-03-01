import express, { Request, Response } from 'express';
import {
    findRestaurantById,
    updateRestaurant,
    addOffer,
    removeOffer,
    addSpecial,
    removeSpecial,
    updateMenuTimestamp,
    getPostsCollection
} from '@restropulse/db';
import { ApiResponse, Restaurant } from '@restropulse/shared';
import { handle } from '../middleware/async-handler.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Get restaurant by ID (public read)
router.get('/:id', handle(async (req: Request, res: Response<ApiResponse<Restaurant>>) => {
    const { id } = req.params;
    const restaurant = await findRestaurantById(id);

    if (restaurant) {
        res.json({
            success: true,
            data: restaurant
        });
    } else {
        res.status(404).json({
            success: false,
            error: 'Restaurant not found'
        });
    }
}));

// Get analytics for a restaurant (computed from posts)
router.get('/:id/analytics', requireAuth, handle(async (req: Request, res: Response<ApiResponse>) => {
    const { id } = req.params;

    if (req.user!.restaurantId !== id) {
        return res.status(403).json({
            success: false,
            error: 'Forbidden'
        });
    }

    const postsCol = getPostsCollection();

    const [postsPerWeek, contentMix, platformMix] = await Promise.all([
        postsCol.aggregate([
            { $match: { restaurantId: id } },
            { $addFields: { scheduledDate: { $toDate: '$scheduledFor' } } },
            { $group: { _id: { $isoWeek: '$scheduledDate' }, posts: { $sum: 1 } } },
            { $sort: { _id: -1 } },
            { $limit: 5 },
            { $project: { _id: 0, week: '$_id', posts: 1 } }
        ]).toArray(),
        postsCol.aggregate([
            { $match: { restaurantId: id } },
            { $group: { _id: '$type', count: { $sum: 1 } } },
            { $project: { _id: 0, type: '$_id', count: 1 } }
        ]).toArray(),
        postsCol.aggregate([
            { $match: { restaurantId: id } },
            { $group: { _id: '$platform', count: { $sum: 1 } } },
            { $project: { _id: 0, platform: '$_id', count: 1 } }
        ]).toArray()
    ]);

    res.json({
        success: true,
        data: { postsPerWeek, contentMix, platformMix }
    });
}));

// Update restaurant
router.put('/:id', requireAuth, handle(async (req: Request, res: Response<ApiResponse<Restaurant>>) => {
    const { id } = req.params;

    if (req.user!.restaurantId !== id) {
        return res.status(403).json({
            success: false,
            error: 'Forbidden'
        });
    }

    const restaurant = await updateRestaurant(id, req.body);

    if (restaurant) {
        res.json({
            success: true,
            data: restaurant,
            message: 'Restaurant updated successfully'
        });
    } else {
        res.status(404).json({
            success: false,
            error: 'Restaurant not found'
        });
    }
}));

// Update offers
router.patch('/:id/offers', requireAuth, handle(async (req: Request, res: Response<ApiResponse<Restaurant>>) => {
    const { id } = req.params;

    if (req.user!.restaurantId !== id) {
        return res.status(403).json({
            success: false,
            error: 'Forbidden'
        });
    }

    const { action, payload } = req.body;

    // Validate action
    if (!action || (action !== 'ADD' && action !== 'DELETE')) {
        return res.status(400).json({
            success: false,
            error: 'Invalid action. Must be ADD or DELETE'
        });
    }

    let restaurant: Restaurant | null = null;

    if (action === 'ADD') {
        if (typeof payload !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Payload must be a string for ADD action'
            });
        }
        restaurant = await addOffer(id, payload);
    }

    if (action === 'DELETE') {
        if (typeof payload !== 'number') {
            return res.status(400).json({
                success: false,
                error: 'Payload must be a number for DELETE action'
            });
        }
        restaurant = await removeOffer(id, payload);
    }

    if (restaurant) {
        res.json({
            success: true,
            data: restaurant,
            message: 'Offers updated successfully'
        });
    } else {
        res.status(404).json({
            success: false,
            error: 'Restaurant not found'
        });
    }
}));

// Update chef specials
router.patch('/:id/specials', requireAuth, handle(async (req: Request, res: Response<ApiResponse<Restaurant>>) => {
    const { id } = req.params;

    if (req.user!.restaurantId !== id) {
        return res.status(403).json({
            success: false,
            error: 'Forbidden'
        });
    }

    const { action, payload } = req.body;

    // Validate action
    if (!action || (action !== 'ADD' && action !== 'DELETE')) {
        return res.status(400).json({
            success: false,
            error: 'Invalid action. Must be ADD or DELETE'
        });
    }

    let restaurant: Restaurant | null = null;

    if (action === 'ADD') {
        if (typeof payload !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Payload must be a string for ADD action'
            });
        }
        restaurant = await addSpecial(id, payload);
    }

    if (action === 'DELETE') {
        if (typeof payload !== 'number') {
            return res.status(400).json({
                success: false,
                error: 'Payload must be a number for DELETE action'
            });
        }
        restaurant = await removeSpecial(id, payload);
    }

    if (restaurant) {
        res.json({
            success: true,
            data: restaurant,
            message: 'Chef specials updated successfully'
        });
    } else {
        res.status(404).json({
            success: false,
            error: 'Restaurant not found'
        });
    }
}));

// Update menu timestamp
router.patch('/:id/menu', requireAuth, handle(async (req: Request, res: Response<ApiResponse<Restaurant>>) => {
    const { id } = req.params;

    if (req.user!.restaurantId !== id) {
        return res.status(403).json({
            success: false,
            error: 'Forbidden'
        });
    }

    const restaurant = await updateMenuTimestamp(id);

    if (restaurant) {
        res.json({
            success: true,
            data: restaurant,
            message: 'Menu updated successfully'
        });
    } else {
        res.status(404).json({
            success: false,
            error: 'Restaurant not found'
        });
    }
}));

export default router;
