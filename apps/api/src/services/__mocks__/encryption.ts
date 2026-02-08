import { jest } from '@jest/globals';

export const generateStateToken = jest.fn(() => 'mock-state-token');
export const encrypt = jest.fn((val: string) => `encrypted_${val}`);
export const decrypt = jest.fn((val: string) => val.replace('encrypted_', ''));
export const generateEncryptionKey = jest.fn(() => 'mock-key');
