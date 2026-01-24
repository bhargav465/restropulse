import { beforeAll, afterAll } from '@jest/globals';
import { connectDB, disconnectDB } from '../src/db/connection.js';

beforeAll(async () => {
    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3002';
    process.env.CORS_ORIGIN = 'http://localhost:3000';
    // MongoDB Atlas test database
    process.env.MONGODB_URI = 'mongodb+srv://dbuser2_baxel:nXXXqHS8ztUT5Y5G@cluster0.y1kon8h.mongodb.net/?retryWrites=true&w=majority';
    process.env.MONGODB_DB_NAME = 'restropulsev1-test';
    // Mock Encryption Key (64 hex characters)
    process.env.ENCRYPTION_KEY = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    // Connect to test database
    await connectDB();
}, 30000);

afterAll(async () => {
    // Cleanup and disconnect
    await disconnectDB();
    // Force exit after a short delay to ensure cleanup
    await new Promise(resolve => setTimeout(resolve, 500));
}, 10000);
