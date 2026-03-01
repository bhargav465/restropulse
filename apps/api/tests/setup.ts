import { beforeAll, afterAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDB, disconnectDB } from '@restropulse/db';

// Store original console methods
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3002';
    process.env.CORS_ORIGIN = 'http://localhost:3000';

    // Start in-memory MongoDB server
    console.log('[Test Setup] Starting MongoDB Memory Server...');
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    console.log('[Test Setup] MongoDB Memory Server started:', mongoUri);

    // Use in-memory MongoDB
    process.env.MONGODB_URI = mongoUri;
    process.env.MONGODB_DB_NAME = 'restropulse-test';

    // Mock Encryption Key (64 hex characters)
    process.env.ENCRYPTION_KEY = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    // Instagram App Secret for signed request verification in tests
    process.env.INSTAGRAM_APP_SECRET = 'test-app-secret';

    // Suppress console.error and console.warn during tests
    console.error = vi.fn();
    console.warn = vi.fn();

    // Connect to in-memory test database
    await connectDB();
    console.log('[Test Setup] Connected to test database');

    // Seed test data
    console.log('[Test Setup] Seeding test data...');
    const { seedTestData } = await import('./helpers/seedData.js');
    await seedTestData();
    console.log('[Test Setup] Test data seeded successfully');
}, 60000);

afterAll(async () => {
    // Restore original console methods
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;

    console.log('[Test Teardown] Disconnecting from database...');
    // Cleanup and disconnect
    await disconnectDB();

    // Stop in-memory MongoDB server
    if (mongoServer) {
        await mongoServer.stop();
        console.log('[Test Teardown] MongoDB Memory Server stopped');
    }
}, 10000);
