import { jest } from '@jest/globals';

export const verifyFirebaseToken = jest.fn();
export const isFirebaseInitialized = jest.fn().mockReturnValue(true);
export const initializeFirebaseAdmin = jest.fn();
export const getFirebaseUser = jest.fn();
