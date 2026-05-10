/** @type {import('jest').Config} */
module.exports = {
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/*.test.ts'],
    moduleNameMapper: {
        '^cc$':     '<rootDir>/src/__mocks__/cc.ts',
        '^cc/env$': '<rootDir>/src/__mocks__/cc-env.ts',
    },
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            tsconfig: '<rootDir>/tsconfig.json',
            diagnostics: false, // skip type-check; we only need transpile for runtime tests
        }],
    },
};
