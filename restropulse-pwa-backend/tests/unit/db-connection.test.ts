
import { jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(__dirname, '../../src/db');
const ORIGINAL_FILE = path.join(SRC_DIR, 'connection.ts');
// Use a fixed name for the copy to avoid cluttering if cleanup fails, 
// but unique enough to not conflict with real files.
const COPY_FILE_NAME = 'connection_test_copy.ts';
const COPY_FILE = path.join(SRC_DIR, COPY_FILE_NAME);

// 1. Define Mocks FIRST
const mockDb = {
    collection: jest.fn(),
};

const mockClientInstance = {
    connect: jest.fn().mockImplementation(async () => { }),
    db: jest.fn().mockReturnValue(mockDb),
    close: jest.fn().mockImplementation(async () => { }),
};

const mockObjectIdInstance = {
    toString: jest.fn().mockReturnThis(),
};
const mockObjectIdConstructor = jest.fn(() => mockObjectIdInstance);
(mockObjectIdConstructor as any).isValid = jest.fn();

// 2. Register Module Mocks
jest.unstable_mockModule('mongodb', () => ({
    MongoClient: jest.fn(() => mockClientInstance),
    ObjectId: mockObjectIdConstructor,
}));

describe('DB Connection', () => {
    let dbModule: any;
    let MongoClient: any;
    let ObjectId: any;
    const ORIGINAL_ENV = process.env;

    beforeAll(async () => {
        // Create the copy of the file to bypass manual mocks associated with the original file name
        // We do this BEFORE importing it.
        if (fs.existsSync(ORIGINAL_FILE)) {
            fs.copyFileSync(ORIGINAL_FILE, COPY_FILE);
        } else {
            throw new Error(`Original file not found: ${ORIGINAL_FILE}`);
        }

        // Load the mocks and the module
        const mongo = await import('mongodb');
        MongoClient = mongo.MongoClient;
        ObjectId = mongo.ObjectId;

        // Import the copy. We use explicit .js extension if the project expects it for TS source in ESM,
        // or .ts if the loader supports it. Given 'import' failed with .ts before in unmock, 
        // but that might be unmock specific.
        // Let's try importing as .js (standard TS-to-ESM mapping).
        try {
            // @ts-ignore
            dbModule = await import(`../../src/db/connection_test_copy.js`);
        } catch (e) {
            // Fallback to .ts if .js fails (e.g. if ts-node/loader expects .ts for dynamic import)
            console.log('Importing .js failed, trying .ts', e);
            // @ts-ignore
            dbModule = await import(`../../src/db/connection_test_copy.ts`);
        }
    });

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...ORIGINAL_ENV };
        process.env.MONGODB_URI = 'mongodb://localhost:27017';
        process.env.MONGODB_DB_NAME = 'testdb';
    });

    afterEach(async () => {
        try {
            if (dbModule && dbModule.disconnectDB) {
                await dbModule.disconnectDB();
            }
        } catch (e) { /* ignore */ }
        process.env = ORIGINAL_ENV;
    });

    afterAll(() => {
        // Cleanup the copy
        if (fs.existsSync(COPY_FILE)) {
            fs.unlinkSync(COPY_FILE);
        }
    });

    test('getConfig should throw if URI not set', () => {
        delete process.env.MONGODB_URI;
        expect(() => dbModule.getConfig()).toThrow('MONGODB_URI environment variable is not set');
    });

    test('getConfig should return config', () => {
        const config = dbModule.getConfig();
        expect(config.uri).toBe('mongodb://localhost:27017');
        expect(config.database).toBe('testdb');
    });

    test('getConfig should default database name', () => {
        delete process.env.MONGODB_DB_NAME;
        const config = dbModule.getConfig();
        expect(config.database).toBe('restropulse');
    });

    test('connectDB should connect to mongo', async () => {
        const db = await dbModule.connectDB();

        expect(MongoClient).toHaveBeenCalledWith('mongodb://localhost:27017');
        expect(mockClientInstance.connect).toHaveBeenCalled();
        expect(mockClientInstance.db).toHaveBeenCalledWith('testdb');
        expect(db).toBe(mockDb);
    });

    test('connectDB should return existing db if connected', async () => {
        await dbModule.connectDB();
        expect(MongoClient).toHaveBeenCalledTimes(1);

        const db = await dbModule.connectDB();
        expect(MongoClient).toHaveBeenCalledTimes(1);
        expect(db).toBe(mockDb);
    });

    test('disconnectDB should close client', async () => {
        await dbModule.connectDB();
        await dbModule.disconnectDB();
        expect(mockClientInstance.close).toHaveBeenCalled();
    });

    test('disconnectDB should do nothing if not connected', async () => {
        await dbModule.disconnectDB();
        jest.clearAllMocks();
        await dbModule.disconnectDB();
        expect(mockClientInstance.close).not.toHaveBeenCalled();
    });

    test('getDB should check connection status', async () => {
        await dbModule.disconnectDB();
        expect(() => dbModule.getDB()).toThrow('Database not connected');

        await dbModule.connectDB();
        expect(dbModule.getDB()).toBe(mockDb);
    });

    describe('Collection Getters', () => {
        beforeEach(async () => {
            await dbModule.connectDB();
        });

        test('getUsersCollection', () => {
            dbModule.getUsersCollection();
            expect(mockDb.collection).toHaveBeenCalledWith('users');
        });

        test('getRestaurantsCollection', () => {
            dbModule.getRestaurantsCollection();
            expect(mockDb.collection).toHaveBeenCalledWith('restaurants');
        });

        test('getPostsCollection', () => {
            dbModule.getPostsCollection();
            expect(mockDb.collection).toHaveBeenCalledWith('posts');
        });

        test('getStrategyCyclesCollection', () => {
            dbModule.getStrategyCyclesCollection();
            expect(mockDb.collection).toHaveBeenCalledWith('strategyCycles');
        });

        test('getContentStrategiesCollection', () => {
            dbModule.getContentStrategiesCollection();
            expect(mockDb.collection).toHaveBeenCalledWith('contentStrategies');
        });

        test('getSessionsCollection', () => {
            dbModule.getSessionsCollection();
            expect(mockDb.collection).toHaveBeenCalledWith('sessions');
        });
    });

    describe('Helpers', () => {
        test('toApiFormat should handle null', () => {
            expect(dbModule.toApiFormat(null)).toBeNull();
        });

        test('toApiFormat should convert _id', () => {
            const input = { _id: 'some-id', name: 'test' };
            const output = dbModule.toApiFormat(input);
            expect(output).toEqual({ id: 'some-id', name: 'test' });
            expect(output).not.toHaveProperty('_id');
        });

        test('toApiFormat should transform instagramCredentials to instagramConnection with valid token', () => {
            const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
            const input = {
                _id: 'r1',
                name: 'Test Restaurant',
                instagramCredentials: {
                    username: 'test_user',
                    userId: 'ig-123',
                    pageName: 'Test Page',
                    connectedAt: new Date('2025-01-01'),
                    tokenExpiresAt: futureDate,
                    accessToken: 'secret-token'
                }
            };
            const output = dbModule.toApiFormat(input);

            expect(output.id).toBe('r1');
            expect(output).not.toHaveProperty('instagramCredentials'); // Sensitive data removed
            expect(output.instagramConnection).toBeDefined();
            expect(output.instagramConnection.connected).toBe(true);
            expect(output.instagramConnection.username).toBe('test_user');
            expect(output.instagramConnection.userId).toBe('ig-123');
            expect(output.instagramConnection.pageName).toBe('Test Page');
            expect(output.instagramConnection.tokenStatus).toBe('valid');
            expect(output.instagramConnection.needsReauthorization).toBe(false);
        });

        test('toApiFormat should mark token as expiring_soon when within 7 days', () => {
            const soonDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days from now
            const input = {
                _id: 'r1',
                instagramCredentials: {
                    username: 'test',
                    tokenExpiresAt: soonDate
                }
            };
            const output = dbModule.toApiFormat(input);

            expect(output.instagramConnection.tokenStatus).toBe('expiring_soon');
            expect(output.instagramConnection.needsReauthorization).toBe(false);
        });

        test('toApiFormat should mark token as expired when past expiration', () => {
            const pastDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day ago
            const input = {
                _id: 'r1',
                instagramCredentials: {
                    username: 'test',
                    tokenExpiresAt: pastDate
                }
            };
            const output = dbModule.toApiFormat(input);

            expect(output.instagramConnection.tokenStatus).toBe('expired');
            expect(output.instagramConnection.needsReauthorization).toBe(true);
        });

        test('toApiFormat should handle missing tokenExpiresAt', () => {
            const input = {
                _id: 'r1',
                instagramCredentials: {
                    username: 'test'
                    // No tokenExpiresAt
                }
            };
            const output = dbModule.toApiFormat(input);

            expect(output.instagramConnection.tokenStatus).toBe('valid');
            expect(output.instagramConnection.needsReauthorization).toBe(false);
        });

        test('toApiFormatArray', () => {
            const input = [{ _id: '1', val: 'a' }, { _id: '2', val: 'b' }];
            const output = dbModule.toApiFormatArray(input);
            expect(output).toHaveLength(2);
            expect(output[0].id).toBe('1');
            expect(output[1].id).toBe('2');
        });

        test('toObjectId should create ObjectId if valid 24 hex chars', () => {
            const validHex = '507f1f77bcf86cd799439011';
            (ObjectId.isValid as any).mockReturnValue(true);

            dbModule.toObjectId(validHex);
            expect(ObjectId).toHaveBeenCalledWith(validHex);
        });

        test('toObjectId should return string if invalid', () => {
            const invalidId = '123';
            (ObjectId.isValid as any).mockReturnValue(false);

            const result = dbModule.toObjectId(invalidId);
            expect(result).toBe(invalidId);
        });

        test('toObjectId should return string if length is not 24', () => {
            const badCount = '507f1f77bcf86cd7994390';
            (ObjectId.isValid as any).mockReturnValue(true);

            const result = dbModule.toObjectId(badCount);
            expect(result).toBe(badCount);
        });
    });
});
