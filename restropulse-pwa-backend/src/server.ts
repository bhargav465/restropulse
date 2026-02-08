import 'dotenv/config'; // Load environment variables before other imports
import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB, disconnectDB } from './db/connection.js';
import { initializeFirebaseAdmin } from './services/firebase-admin.js';
import { startTokenRefreshCron } from './services/token-refresh-cron.js';
import { startPublishingCron } from './services/publishing-cron.js';
import authRoutes from './routes/auth.js';
import restaurantRoutes from './routes/restaurant.js';
import postsRoutes from './routes/posts.js';
import strategyRoutes from './routes/strategy.js';
import integrationsRoutes from './routes/integrations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Express = express();
const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';

// Initialize Firebase Admin SDK (optional - for production auth)
initializeFirebaseAdmin();

// Serve static content from public directory
app.use('/content', express.static(path.join(__dirname, '../public')));

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
app.use('/api/integrations', integrationsRoutes);

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
const startServer = async () => {
    try {
        // Connect to MongoDB
        await connectDB();

        // Start Instagram token refresh cron job
        startTokenRefreshCron();

        // Start publishing cron job (checks every 5 minutes for scheduled posts)
        startPublishingCron();

        app.listen(PORT, () => {
            console.log(`
  RestroPulse Backend Server
  
  Environment: ${process.env.NODE_ENV || 'development'}
  Port: ${PORT}
  CORS Origin: ${CORS_ORIGIN}
  Database: MongoDB Connected
  
  Server is running at http://localhost:${PORT}
  Health check: http://localhost:${PORT}/health
  API Base: http://localhost:${PORT}/api
  `);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down gracefully...');
    await disconnectDB();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\nShutting down gracefully...');
    await disconnectDB();
    process.exit(0);
});

startServer();

export default app;
