import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import restaurantRoutes from './routes/restaurant.js';
import postsRoutes from './routes/posts.js';
import strategyRoutes from './routes/strategy.js';

// Load environment variables
dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';

// Middleware - Allow both ports 3000 and 3001 for development
app.use(cors({
    origin: [CORS_ORIGIN, 'http://localhost:3001'],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/restaurant', restaurantRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/strategy', strategyRoutes);

// 404 handler
app.use((_req: Request, res: Response) => {
    res.status(404).json({
        success: false,
        error: 'Route not found'
    });
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`
  RestroPulse Backend Server
  
  Environment: ${process.env.NODE_ENV || 'development'}
  Port: ${PORT}
  CORS Origin: ${CORS_ORIGIN}
  
  Server is running at http://localhost:${PORT}
  Health check: http://localhost:${PORT}/health
  API Base: http://localhost:${PORT}/api
  `);
});

export default app;
