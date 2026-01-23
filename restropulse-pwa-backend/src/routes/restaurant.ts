import express, { Request, Response } from 'express';
import {
    findRestaurantById,
    updateRestaurant,
    addOffer,
    removeOffer,
    addSpecial,
    removeSpecial,
    updateMenuTimestamp
} from '../db/restaurants.js';
import { ApiResponse, Restaurant } from '../models/types.js';

const router = express.Router();

// Get restaurant by ID
router.get('/:id', async (req: Request, res: Response<ApiResponse<Restaurant>>) => {
    try {
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
    } catch (error) {
        console.error('Get restaurant error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Update restaurant
router.put('/:id', async (req: Request, res: Response<ApiResponse<Restaurant>>) => {
    try {
        const { id } = req.params;
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
    } catch (error) {
        console.error('Update restaurant error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Update offers
router.patch('/:id/offers', async (req: Request, res: Response<ApiResponse<Restaurant>>) => {
    try {
        const { id } = req.params;
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
    } catch (error) {
        console.error('Update offers error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Update chef specials
router.patch('/:id/specials', async (req: Request, res: Response<ApiResponse<Restaurant>>) => {
    try {
        const { id } = req.params;
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
    } catch (error) {
        console.error('Update specials error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Update menu timestamp
router.patch('/:id/menu', async (req: Request, res: Response<ApiResponse<Restaurant>>) => {
    try {
        const { id } = req.params;
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
    } catch (error) {
        console.error('Update menu error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

export default router;
