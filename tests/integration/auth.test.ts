// Integration tests for POST /auth/register and POST /auth/login.
// Prisma is mocked so tests run without a real database.
// supertest sends real HTTP through the Express app.

import request from 'supertest';
import app from '../../src/app';

// ── Mock Prisma ────────────────────────────────────────────────────────────────
// Each test can override these with jest.mocked(prisma).user.findUnique.mockResolvedValue(...)

// Disable rate limiting so rapid test requests aren't blocked
jest.mock('../../src/middleware/rate-limit.middleware', () => {
  const pass = (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    authRateLimit: pass,
    aiRateLimit: pass,
    uploadRateLimit: pass,
    apiRateLimit: pass,
    analyzeRateLimit: pass,
    compareRateLimit: pass,
  };
});

jest.mock('../../src/config/database', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

// Mock bcryptjs to make tests fast (no real hashing)
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
}));

// Mock email so tests never attempt real network calls
jest.mock('../../src/config/email', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  getEmailMode: jest.fn().mockReturnValue('test'),
  getFromAddress: jest.fn().mockReturnValue('"Resumora" <noreply@resumora.app>'),
  getReplyToAddress: jest.fn().mockReturnValue('"Resumora" <noreply@resumora.app>'),
  buildEmailHtml: jest.fn().mockReturnValue('<html></html>'),
  buildEmailText: jest.fn().mockReturnValue('text'),
  verifyEmailSetup: jest.fn().mockResolvedValue(true),
}));

import { prisma } from '../../src/config/database';
import bcrypt from 'bcryptjs';

const mockUser = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  email: 'test@example.com',
  password: 'hashed-password',
  firstName: 'Alice',
  lastName: 'Engineer',
  emailVerified: true,
  emailVerificationToken: null,
  emailVerificationExpiry: null,
  passwordResetToken: null,
  passwordResetExpiry: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Registration ───────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/register', () => {
  it('creates an account and sends a verification email', async () => {
    jest.mocked(prisma.user.findUnique).mockResolvedValue(null); // email not taken
    jest.mocked(prisma.user.create).mockResolvedValue(mockUser);
    jest.mocked(prisma.user.update).mockResolvedValue(mockUser);

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'test@example.com',
        password: 'SecurePass123!',
        firstName: 'Alice',
        lastName: 'Engineer',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.requiresVerification).toBe(true);
  });

  it('rejects duplicate email', async () => {
    jest.mocked(prisma.user.findUnique).mockResolvedValue(mockUser); // email already taken

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'test@example.com',
        password: 'SecurePass123!',
        firstName: 'Alice',
        lastName: 'Engineer',
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('rejects missing required fields', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'test@example.com' }); // no password/name

    expect(res.status).toBe(422);
  });

  it('rejects short password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'test@example.com', password: '123', firstName: 'A', lastName: 'B' });

    expect(res.status).toBe(422);
  });
});

// ── Login ──────────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/login', () => {
  it('returns JWT for valid credentials', async () => {
    jest.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
    jest.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com', password: 'SecurePass123!' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('token');
  });

  it('rejects wrong password', async () => {
    jest.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
    jest.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com', password: 'wrong' });

    expect(res.status).toBe(401);
  });

  it('rejects non-existent email', async () => {
    jest.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'anything' });

    expect(res.status).toBe(401);
  });
});

// ── Health ────────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 without auth', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
  });
});
