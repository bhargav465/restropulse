export default {
    preset: 'ts-jest/presets/default-esm',
    testEnvironment: 'node',
    rootDir: '.',
    extensionsToTreatAsEsm: ['.ts'],
    moduleNameMapper: {
        // '.*services/firebase-admin(\\.js)?$': '<rootDir>/src/services/__mocks__/firebase-admin.ts',
        // Restore real mapping for firebase-admin so tests can choose
        '.*services/firebase-admin(\\.js)?$': '<rootDir>/src/services/firebase-admin.ts',

        // Specific relative import match for service files using it
        // '^\\./encryption(\\.js)?$': '<rootDir>/src/services/__mocks__/encryption.ts',
        '.*services/encryption(\\.js)?$': '<rootDir>/src/services/encryption.ts',
        // '.*db/connection(\\.js)?$': '<rootDir>/src/db/__mocks__/connection.ts',
        // '.*src/db/connection(\\.js)?$': '<rootDir>/src/db/__mocks__/connection.ts',
        // Universal match for connection.js
        'connection.js$': '<rootDir>/src/db/__mocks__/connection.ts',
        'connection$': '<rootDir>/src/db/__mocks__/connection.ts',
        // Make posts mockable
        '.*db/posts(\\.js)?$': '<rootDir>/src/db/posts.ts',
        // Explicitly map instagram-api to ts file to help resolution
        '.*services/instagram-api(\\.js)?$': '<rootDir>/src/services/instagram-api.ts',
        '.*services/token-refresh-cron(\\.js)?$': '<rootDir>/src/services/token-refresh-cron.ts',
        '.*services/jwt(\\.js)?$': '<rootDir>/src/services/jwt.ts',
        '.*db/users(\\.js)?$': '<rootDir>/src/db/users.ts',
        '.*db/strategy(\\.js)?$': '<rootDir>/src/db/strategy.ts',
        '.*db/restaurants(\\.js)?$': '<rootDir>/src/db/restaurants.ts',
        // '.*services/encryption(\\.js)?$': '<rootDir>/src/services/__mocks__/encryption.ts',
        // '.*/encryption\\.js$': '<rootDir>/src/services/__mocks__/encryption.ts',
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
    transform: {
        '^.+\\.tsx?$': [
            'ts-jest',
            {
                useESM: true,
            },
        ],
    },
    testMatch: [
        '**/tests/**/*.test.ts',
        '**/tests/**/*.spec.ts'
    ],
    // Run unit tests first, then integration tests
    testSequencer: '<rootDir>/tests/sequencer.cjs',
    setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/server.ts'
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    verbose: true,
    testTimeout: 10000,
    forceExit: true,
    detectOpenHandles: false
};
