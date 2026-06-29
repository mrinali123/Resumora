// Global test setup — runs before each test file.
// Sets environment variables so imports of src/config/env don't fail.

process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/test';
process.env['JWT_SECRET'] = 'test-secret-that-is-at-least-32-characters-long!!';
process.env['JWT_EXPIRES_IN'] = '7d';
process.env['PORT'] = '3001';

// Silence pino logging in tests
process.env['LOG_LEVEL'] = 'silent';
