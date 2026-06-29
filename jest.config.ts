import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  setupFiles: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    // Alias for cleaner imports in tests
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          // Tests compile to CommonJS to avoid ESM/CJS interop issues
          module: 'commonjs',
        },
      },
    ],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/server.ts',
    '!src/docs/**',
    '!src/**/*.d.ts',
    '!src/queue/workers/**', // Integration-tested separately
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  // Fail CI if coverage drops below these thresholds
  coverageThreshold: {
    global: {
      functions: 60,
      lines: 60,
    },
  },
  testTimeout: 10000,
  verbose: true,
};

export default config;
