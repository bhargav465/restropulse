import express, { Request, Response } from 'express';
import {
    findContentStrategy,
    updateContentStrategy,
    findAllCycles,
    findCycleById,
    createCycle,
    updateCycle
} from '@restropulse/db';
import { ApiResponse, StrategyCycle, ContentStrategy } from '@restropulse/shared';
import { handle } from '../middleware/async-handler.js';

const router = express.Router();

// Default restaurant ID (in production, get from auth context)
const DEFAULT_RESTAURANT_ID = 'r1';

// Get content strategy
router.get('/', handle(async (_req: Request, res: Response<ApiResponse<ContentStrategy>>) => {
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
}));

// Update content strategy
router.put('/', handle(async (req: Request, res: Response<ApiResponse<ContentStrategy>>) => {
    const strategy = await updateContentStrategy(DEFAULT_RESTAURANT_ID, {
        ...req.body,
        restaurantId: DEFAULT_RESTAURANT_ID
    });

    res.json({
        success: true,
        data: strategy!,
        message: 'Content strategy updated successfully'
    });
}));

// Get all cycles
router.get('/cycles', handle(async (_req: Request, res: Response<ApiResponse<StrategyCycle[]>>) => {
    const cycles = await findAllCycles();
    res.json({
        success: true,
        data: cycles
    });
}));

// Get cycle by ID
router.get('/cycles/:id', handle(async (req: Request, res: Response<ApiResponse<StrategyCycle>>) => {
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
}));

// Create new cycle
router.post('/cycles', handle(async (req: Request, res: Response<ApiResponse<StrategyCycle>>) => {
    const newCycle = await createCycle({
        ...req.body,
        restaurantId: DEFAULT_RESTAURANT_ID
    });

    res.status(201).json({
        success: true,
        data: newCycle,
        message: 'Strategy cycle created successfully'
    });
}));

// Update cycle
router.put('/cycles/:id', handle(async (req: Request, res: Response<ApiResponse<StrategyCycle>>) => {
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
}));

export default router;
