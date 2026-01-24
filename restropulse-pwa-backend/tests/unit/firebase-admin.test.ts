import { jest, describe, test, expect, beforeEach, afterAll } from '@jest/globals';

// Define mocks first
const mockInitializeApp = jest.fn();
const mockCert = jest.fn();
const mockApplicationDefault = jest.fn();
const mockVerifyIdToken = jest.fn();
const mockGetUser = jest.fn();

// Mock the external library using unstable_mockModule for ESM
await jest.unstable_mockModule('firebase-admin', () => ({
    __esModule: true,
    default: {
        initializeApp: mockInitializeApp,
        credential: {
            cert: mockCert,
            applicationDefault: mockApplicationDefault
        },
        auth: jest.fn(() => ({
            verifyIdToken: mockVerifyIdToken,
            getUser: mockGetUser
        }))
    }
}));

// Import the service dynamically
// Note: We deliberately omit .js extension to bypass moduleNameMapper used for other tests
const firebaseService = await import('../../src/services/firebase-admin');

describe('Firebase Admin Service', () => {
    const originalEnv = process.env;
    const originalConsoleWarn = console.warn;
    const originalConsoleLog = console.log;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv };
        // Reset initialization state
        if ((firebaseService as any).resetFirebaseConfigForTesting) {
            (firebaseService as any).resetFirebaseConfigForTesting();
        }
        console.warn = jest.fn();
        console.log = jest.fn();
    });

    afterAll(() => {
        process.env = originalEnv;
        console.warn = originalConsoleWarn;
        console.log = originalConsoleLog;
    });

    describe('Initialization', () => {
        test('should initialize with service account key (Option 1)', () => {
            process.env.FIREBASE_SERVICE_ACCOUNT_KEY = '{"project_id": "test-sa"}';

            firebaseService.initializeFirebaseAdmin();

            expect(mockInitializeApp).toHaveBeenCalled();
            expect(mockCert).toHaveBeenCalledWith({ project_id: 'test-sa' });
            expect(firebaseService.isFirebaseInitialized()).toBe(true);
        });

        test('should initialize with application default credentials (Option 2)', () => {
            delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
            process.env.GOOGLE_APPLICATION_CREDENTIALS = '/path/to/creds.json';

            firebaseService.initializeFirebaseAdmin();

            expect(mockInitializeApp).toHaveBeenCalled();
            expect(mockApplicationDefault).toHaveBeenCalled();
            expect(firebaseService.isFirebaseInitialized()).toBe(true);
        });

        test('should initialize in development mode with project ID (Option 3)', () => {
            delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
            delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
            process.env.FIREBASE_PROJECT_ID = 'dev-project';

            firebaseService.initializeFirebaseAdmin();

            expect(mockInitializeApp).toHaveBeenCalledWith({ projectId: 'dev-project' });
            expect(firebaseService.isFirebaseInitialized()).toBe(true);
        });

        test('should NOT initialize if no config provided', () => {
            delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
            delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
            delete process.env.FIREBASE_PROJECT_ID;

            firebaseService.initializeFirebaseAdmin();

            expect(mockInitializeApp).not.toHaveBeenCalled();
            expect(firebaseService.isFirebaseInitialized()).toBe(false);
            expect(console.warn).toHaveBeenCalled();
        });

        test('should not re-initialize if already initialized', () => {
            process.env.FIREBASE_SERVICE_ACCOUNT_KEY = '{"project_id": "test"}';

            firebaseService.initializeFirebaseAdmin();
            expect(mockInitializeApp).toHaveBeenCalledTimes(1);

            // Second call
            firebaseService.initializeFirebaseAdmin();
            expect(mockInitializeApp).toHaveBeenCalledTimes(1);
        });

        test('should handle invalid JSON in service account key', () => {
            process.env.FIREBASE_SERVICE_ACCOUNT_KEY = '{invalid-json}';

            // Should catch error internally
            expect(() => firebaseService.initializeFirebaseAdmin()).not.toThrow();
            expect(firebaseService.isFirebaseInitialized()).toBe(false);
        });
    });

    describe('Verification', () => {
        beforeEach(() => {
            process.env.FIREBASE_SERVICE_ACCOUNT_KEY = '{"project_id": "test"}';
            firebaseService.initializeFirebaseAdmin();
            jest.clearAllMocks(); // Clear calls from init
        });

        test('verifyFirebaseToken should call admin.auth().verifyIdToken', async () => {
            const mockUid = 'test-uid-123';
            (mockVerifyIdToken as jest.Mock<any>).mockResolvedValue({ uid: mockUid });

            const result = await firebaseService.verifyFirebaseToken('valid-token');

            expect(mockVerifyIdToken).toHaveBeenCalledWith('valid-token');
            expect(result).toEqual({ uid: mockUid });
        });

        test('verifyFirebaseToken should return null on error', async () => {
            (mockVerifyIdToken as jest.Mock<any>).mockRejectedValue(new Error('Auth error'));

            const result = await firebaseService.verifyFirebaseToken('invalid-token');

            expect(result).toBeNull();
        });

        test('verifyFirebaseToken should return null if not initialized', async () => {
            (firebaseService as any).resetFirebaseConfigForTesting();
            const result = await firebaseService.verifyFirebaseToken('token');
            expect(result).toBeNull();
        });
    });

    describe('GetUser', () => {
        beforeEach(() => {
            process.env.FIREBASE_SERVICE_ACCOUNT_KEY = '{"project_id": "test"}';
            firebaseService.initializeFirebaseAdmin();
        });

        test('should get user by uid', async () => {
            const mockUser = { uid: 'u1', email: 'test@test.com' };
            (mockGetUser as jest.Mock<any>).mockResolvedValue(mockUser);

            const result = await firebaseService.getFirebaseUser('u1');
            expect(result).toEqual(mockUser);
            expect(mockGetUser).toHaveBeenCalledWith('u1');
        });

        test('should return null on error', async () => {
            (mockGetUser as jest.Mock<any>).mockRejectedValue(new Error('Ooops'));
            const result = await firebaseService.getFirebaseUser('u1');
            expect(result).toBeNull();
        });

        test('should return null if not initialized', async () => {
            (firebaseService as any).resetFirebaseConfigForTesting();
            const result = await firebaseService.getFirebaseUser('u1');
            expect(result).toBeNull();
        });
    });
});
