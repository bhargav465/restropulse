import express, { Request, Response } from 'express';
import { MOCK_USER } from '../data/mockData.js';
import { AuthResponse, LoginRequest } from '../models/types.js';

const router = express.Router();

// Login endpoint
router.post('/login', (req: Request<{}, {}, LoginRequest>, res: Response<AuthResponse>) => {
    const { email, password } = req.body;

    // Simple mock authentication
    if (email === MOCK_USER.email && password) {
        res.json({
            success: true,
            user: MOCK_USER,
            token: 'mock-jwt-token-' + Date.now(),
            message: 'Login successful'
        });
    } else {
        res.status(401).json({
            success: false,
            message: 'Invalid credentials'
        });
    }
});

// Logout endpoint
router.post('/logout', (_req: Request, res: Response) => {
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

// Session check endpoint
router.get('/session', (req: Request, res: Response) => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (token && token.startsWith('mock-jwt-token')) {
        res.json({
            success: true,
            user: MOCK_USER
        });
    } else {
        res.status(401).json({
            success: false,
            message: 'No valid session'
        });
    }
});

export default router;
