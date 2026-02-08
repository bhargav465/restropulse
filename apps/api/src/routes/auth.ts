import express, { Request, Response } from 'express';
import { findUserByEmail, findUserByPhone, findUserById, createUser, findUserByFirebaseUid, updateUser } from '../db/users.js';
import { AuthResponse, LoginRequest, OtpRequest, OtpVerifyRequest } from '../models/types.js';
import { generateTokens, verifyToken, refreshAccessToken } from '../services/jwt.js';
import { verifyFirebaseToken, isFirebaseInitialized } from '../services/firebase-admin.js';

const router = express.Router();

// In-memory OTP store (for development fallback when Firebase is not available)
const otpStore = new Map<string, { otp: string; expiresAt: number; attempts: number }>();

// Generate 6-digit OTP (for development fallback)
function generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// ============================================
// Firebase Authentication (Primary - Production)
// ============================================

/**
 * Verify Firebase ID token and create/login user
 * This is the primary authentication method for production
 */
router.post('/firebase', async (req: Request, res: Response) => {
    try {
        const { idToken } = req.body;

        if (!idToken) {
            return res.status(400).json({
                success: false,
                message: 'Firebase ID token required'
            });
        }

        // Verify the Firebase token
        const decodedToken = await verifyFirebaseToken(idToken);

        if (!decodedToken) {
            return res.status(401).json({
                success: false,
                message: 'Invalid Firebase token'
            });
        }

        const { uid, phone_number: phone } = decodedToken;

        if (!phone) {
            return res.status(400).json({
                success: false,
                message: 'Phone number not found in token'
            });
        }

        // Find user by Firebase UID or phone
        let user = await findUserByFirebaseUid(uid);

        if (!user) {
            // Check if user exists with this phone (migrating from old auth)
            user = await findUserByPhone(phone);

            if (user) {
                // Link existing user to Firebase UID
                user = await updateUser(user.id, { firebaseUid: uid });
            } else {
                // Create new user - use phone-based unique email placeholder
                user = await createUser({
                    name: 'Restaurant Owner',
                    email: `${phone.replace('+', '')}@phone.restropulse.local`,
                    phone,
                    firebaseUid: uid,
                    role: 'OWNER'
                });
            }
        }

        if (!user) {
            return res.status(500).json({
                success: false,
                message: 'Failed to create or find user'
            });
        }

        // Generate our own JWT tokens for API authorization
        const tokens = generateTokens(user.id, phone);

        res.json({
            success: true,
            user,
            token: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            message: 'Login successful'
        });
    } catch (error) {
        console.error('Firebase auth error:', error);
        res.status(500).json({
            success: false,
            message: 'Authentication failed'
        });
    }
});

// ============================================
// Fallback OTP Authentication (Development)
// ============================================

// Send OTP endpoint (fallback for development when Firebase is not available)
router.post('/send-otp', async (req: Request<{}, {}, OtpRequest>, res: Response) => {
    try {
        const { phone } = req.body;

        if (!phone || !/^\+91\d{10}$/.test(phone)) {
            return res.status(400).json({
                success: false,
                message: 'Valid Indian phone number required (+91XXXXXXXXXX)'
            });
        }

        // Generate OTP
        const otp = generateOtp();
        const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

        // Store OTP
        otpStore.set(phone, { otp, expiresAt, attempts: 0 });

        // Log OTP for development
        console.log(`[OTP] ${phone}: ${otp}`);

        res.json({
            success: true,
            message: 'OTP sent successfully',
            // Include OTP in development for testing
            ...(process.env.NODE_ENV !== 'production' && { devOtp: otp })
        });
    } catch (error) {
        console.error('Send OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send OTP'
        });
    }
});

// Verify OTP and login
router.post('/verify-otp', async (req: Request<{}, {}, OtpVerifyRequest>, res: Response) => {
    try {
        const { phone, otp } = req.body;

        if (!phone || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Phone and OTP are required'
            });
        }

        const stored = otpStore.get(phone);

        // Check if OTP exists
        if (!stored) {
            return res.status(400).json({
                success: false,
                message: 'OTP expired or not found. Please request a new one.'
            });
        }

        // Check expiration
        if (Date.now() > stored.expiresAt) {
            otpStore.delete(phone);
            return res.status(400).json({
                success: false,
                message: 'OTP has expired. Please request a new one.'
            });
        }

        // Check attempts
        if (stored.attempts >= 3) {
            otpStore.delete(phone);
            return res.status(400).json({
                success: false,
                message: 'Too many attempts. Please request a new OTP.'
            });
        }

        // Verify OTP
        if (stored.otp !== otp) {
            stored.attempts++;
            return res.status(401).json({
                success: false,
                message: `Invalid OTP. ${3 - stored.attempts} attempts remaining.`
            });
        }

        // OTP verified - clear it
        otpStore.delete(phone);

        // Find or create user
        let user = await findUserByPhone(phone);

        if (!user) {
            // Auto-create user on first login - use phone-based unique email placeholder
            user = await createUser({
                name: 'Restaurant Owner',
                email: `${phone.replace('+', '')}@phone.restropulse.local`,
                phone,
                role: 'OWNER'
            });
        }

        // Generate JWT tokens
        const tokens = generateTokens(user.id, phone);

        res.json({
            success: true,
            user,
            token: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            message: 'Login successful'
        });
    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Refresh token endpoint
router.post('/refresh', async (req: Request, res: Response) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                message: 'Refresh token required'
            });
        }

        const newAccessToken = refreshAccessToken(refreshToken);

        if (!newAccessToken) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired refresh token'
            });
        }

        res.json({
            success: true,
            token: newAccessToken
        });
    } catch (error) {
        console.error('Refresh token error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Legacy email/password login (for backwards compatibility)
router.post('/login', async (req: Request<{}, {}, LoginRequest>, res: Response<AuthResponse>) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        const user = await findUserByEmail(email);

        if (user && password) {
            const tokens = generateTokens(user.id, user.phone);
            res.json({
                success: true,
                user,
                token: tokens.accessToken,
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
    // In a full implementation, you'd invalidate the refresh token here
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

// Session check / Get current user
router.get('/session', async (req: Request, res: Response) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No token provided'
            });
        }

        const payload = verifyToken(token);

        if (!payload || payload.type !== 'access') {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired token'
            });
        }

        const user = await findUserById(payload.userId);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            user
        });
    } catch (error) {
        console.error('Session check error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

export default router;
