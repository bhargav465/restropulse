import express, { Request, Response } from 'express';
import { MOCK_STRATEGY_CYCLES, MOCK_CONTENT_STRATEGY } from '../data/mockData.js';
import { ApiResponse, StrategyCycle, ContentStrategy } from '../models/types.js';

const router = express.Router();

// In-memory storage
let cycles = [...MOCK_STRATEGY_CYCLES];
let contentStrategy = { ...MOCK_CONTENT_STRATEGY };

// Get content strategy
router.get('/', (_req: Request, res: Response<ApiResponse<ContentStrategy>>) => {
    res.json({
        success: true,
        data: contentStrategy
    });
});

// Update content strategy
router.put('/', (req: Request, res: Response<ApiResponse<ContentStrategy>>) => {
    contentStrategy = { ...contentStrategy, ...req.body };
    res.json({
        success: true,
        data: contentStrategy,
        message: 'Content strategy updated successfully'
    });
});

// Get all cycles
router.get('/cycles', (_req: Request, res: Response<ApiResponse<StrategyCycle[]>>) => {
    res.json({
        success: true,
        data: cycles
    });
});

// Get cycle by ID
router.get('/cycles/:id', (req: Request, res: Response<ApiResponse<StrategyCycle>>) => {
    const { id } = req.params;
    const cycle = cycles.find(c => c.id === id);

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
});

// Create new cycle
router.post('/cycles', (req: Request, res: Response<ApiResponse<StrategyCycle>>) => {
    const newCycle: StrategyCycle = {
        id: 'sc' + (cycles.length + 1),
        ...req.body
    };

    cycles.unshift(newCycle);

    res.status(201).json({
        success: true,
        data: newCycle,
        message: 'Strategy cycle created successfully'
    });
});

// Update cycle
router.put('/cycles/:id', (req: Request, res: Response<ApiResponse<StrategyCycle>>) => {
    const { id } = req.params;
    const index = cycles.findIndex(c => c.id === id);

    if (index !== -1) {
        cycles[index] = { ...cycles[index], ...req.body, id };
        res.json({
            success: true,
            data: cycles[index],
            message: 'Strategy cycle updated successfully'
        });
    } else {
        res.status(404).json({
            success: false,
            error: 'Strategy cycle not found'
        });
    }
});

export default router;
