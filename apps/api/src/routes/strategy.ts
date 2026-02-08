import express, { Request, Response } from 'express';
import {
    findContentStrategy,
    updateContentStrategy,
    findAllCycles,
    findCycleById,
    createCycle,
    updateCycle
} from '../db/strategy.js';
import { ApiResponse, StrategyCycle, ContentStrategy } from '../models/types.js';

const router = express.Router();

// Default restaurant ID (in production, get from auth context)
const DEFAULT_RESTAURANT_ID = 'r1';

// Get content strategy
router.get('/', async (_req: Request, res: Response<ApiResponse<ContentStrategy>>) => {
    try {
        let strategy = await findContentStrategy(DEFAULT_RESTAURANT_ID);

        // Return default if none exists
        if (!strategy) {
            strategy = {
                id: 'default',
                postsPerWeek: 5,
                focusCategories: [],
                bestTime: '6:00 PM - 8:00 PM',
                nextScheduledDate: new Date().toISOString(),
                theme: ''
            } as ContentStrategy;
        }

        res.json({
            success: true,
            data: strategy
        });
    } catch (error) {
        console.error('Get strategy error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Update content strategy
router.put('/', async (req: Request, res: Response<ApiResponse<ContentStrategy>>) => {
    try {
        const strategy = await updateContentStrategy(DEFAULT_RESTAURANT_ID, {
            ...req.body,
            restaurantId: DEFAULT_RESTAURANT_ID
        });

        res.json({
            success: true,
            data: strategy!,
            message: 'Content strategy updated successfully'
        });
    } catch (error) {
        console.error('Update strategy error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Get all cycles
router.get('/cycles', async (_req: Request, res: Response<ApiResponse<StrategyCycle[]>>) => {
    try {
        const cycles = await findAllCycles();
        res.json({
            success: true,
            data: cycles
        });
    } catch (error) {
        console.error('Get cycles error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Get cycle by ID
router.get('/cycles/:id', async (req: Request, res: Response<ApiResponse<StrategyCycle>>) => {
    try {
        const { id } = req.params;
        const cycle = await findCycleById(id);

        if (cycle) {
            res.json({
                success: true,
                data: cycle
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Strategy cycle not found'
            });
        }
    } catch (error) {
        console.error('Get cycle error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Create new cycle
router.post('/cycles', async (req: Request, res: Response<ApiResponse<StrategyCycle>>) => {
    try {
        const newCycle = await createCycle({
            ...req.body,
            restaurantId: DEFAULT_RESTAURANT_ID
        });

        res.status(201).json({
            success: true,
            data: newCycle,
            message: 'Strategy cycle created successfully'
        });
    } catch (error) {
        console.error('Create cycle error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Update cycle
router.put('/cycles/:id', async (req: Request, res: Response<ApiResponse<StrategyCycle>>) => {
    try {
        const { id } = req.params;
        const cycle = await updateCycle(id, req.body);

        if (cycle) {
            res.json({
                success: true,
                data: cycle,
                message: 'Strategy cycle updated successfully'
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Strategy cycle not found'
            });
        }
    } catch (error) {
        console.error('Update cycle error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

export default router;
