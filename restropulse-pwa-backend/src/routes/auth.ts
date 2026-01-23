import express, { Request, Response } from 'express';
import { findUserByEmail } from '../db/users.js';
import { AuthResponse, LoginRequest } from '../models/types.js';

const router = express.Router();

// Login endpoint
router.post('/login', async (req: Request<{}, {}, LoginRequest>, res: Response<AuthResponse>) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Find user by email
        const user = await findUserByEmail(email);

        if (user && password) {
            // In production, verify password hash here
            res.json({
                success: true,
                user,
                token: 'jwt-token-' + Date.now(),
                message: 'Login successful'
            });
        } else {
            res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
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
router.get('/session', async (req: Request, res: Response) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');

        if (token && token.startsWith('jwt-token')) {
            // In production, decode JWT and get user ID
            // For now, return the first user (demo mode)
            const user = await findUserByEmail('arjun@spicelounge.com');

            if (user) {
                res.json({
                    success: true,
                    user
                });
            } else {
                res.status(401).json({
                    success: false,
                    message: 'User not found'
                });
            }
        } else {
            res.status(401).json({
                success: false,
                message: 'No valid session'
            });
        }
    } catch (error) {
        console.error('Session check error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

export default router;
