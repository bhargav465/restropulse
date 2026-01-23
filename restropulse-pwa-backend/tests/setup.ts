import { beforeAll, afterAll } from '@jest/globals';

beforeAll(() => {
    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3002';
    process.env.CORS_ORIGIN = 'http://localhost:3000';
});

afterAll(() => {
    // Cleanup
});
