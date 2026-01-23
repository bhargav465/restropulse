import express, { Request, Response } from 'express';
import { MOCK_RESTAURANT } from '../data/mockData.js';
import { ApiResponse, Restaurant } from '../models/types.js';

const router = express.Router();

// In-memory storage (will be replaced with database)
let restaurantData = { ...MOCK_RESTAURANT };

// Get restaurant by ID
router.get('/:id', (req: Request, res: Response<ApiResponse<Restaurant>>) => {
    const { id } = req.params;

    if (id === restaurantData.id) {
        res.json({
            success: true,
            data: restaurantData
        });
    } else {
        res.status(404).json({
            success: false,
            error: 'Restaurant not found'
        });
    }
});

// Update restaurant
router.put('/:id', (req: Request, res: Response<ApiResponse<Restaurant>>) => {
    const { id } = req.params;

    if (id === restaurantData.id) {
        restaurantData = { ...restaurantData, ...req.body, id };
        res.json({
            success: true,
            data: restaurantData,
            message: 'Restaurant updated successfully'
        });
    } else {
        res.status(404).json({
            success: false,
            error: 'Restaurant not found'
        });
    }
});

// Update offers
router.patch('/:id/offers', (req: Request, res: Response<ApiResponse<Restaurant>>) => {
    const { action, payload } = req.body;

    // Validate action
    if (!action || (action !== 'ADD' && action !== 'DELETE')) {
        return res.status(400).json({
            success: false,
            error: 'Invalid action. Must be ADD or DELETE'
        });
    }

    // Handle ADD action
    if (action === 'ADD') {
        if (typeof payload !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Payload must be a string for ADD action'
            });
        }
        restaurantData.activeOffers = [payload, ...(restaurantData.activeOffers || [])];
    }

    // Handle DELETE action
    if (action === 'DELETE') {
        if (typeof payload !== 'number') {
            return res.status(400).json({
                success: false,
                error: 'Payload must be a number for DELETE action'
            });
        }
        restaurantData.activeOffers = (restaurantData.activeOffers || []).filter((_, i) => i !== payload);
    }

    res.json({
        success: true,
        data: restaurantData,
        message: 'Offers updated successfully'
    });
});

// Update chef specials
router.patch('/:id/specials', (req: Request, res: Response<ApiResponse<Restaurant>>) => {
    const { action, payload } = req.body;

    // Validate action
    if (!action || (action !== 'ADD' && action !== 'DELETE')) {
        return res.status(400).json({
            success: false,
            error: 'Invalid action. Must be ADD or DELETE'
        });
    }

    // Handle ADD action
    if (action === 'ADD') {
        if (typeof payload !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Payload must be a string for ADD action'
            });
        }
        restaurantData.chefSpecials = [payload, ...(restaurantData.chefSpecials || [])];
    }

    // Handle DELETE action
    if (action === 'DELETE') {
        if (typeof payload !== 'number') {
            return res.status(400).json({
                success: false,
                error: 'Payload must be a number for DELETE action'
            });
        }
        restaurantData.chefSpecials = (restaurantData.chefSpecials || []).filter((_, i) => i !== payload);
    }

    res.json({
        success: true,
        data: restaurantData,
        message: 'Chef specials updated successfully'
    });
});

// Update menu timestamp
router.patch('/:id/menu', (_req: Request, res: Response<ApiResponse<Restaurant>>) => {
    restaurantData.menuLastUpdated = new Date().toISOString().split('T')[0];

    res.json({
        success: true,
        data: restaurantData,
        message: 'Menu timestamp updated'
    });
});

export default router;
