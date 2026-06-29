import { PrismaClient } from '@prisma/client';
import { env } from './env';

// Single PrismaClient instance shared across the app.
// Prisma manages its own connection pool internally; multiple instances would
// open redundant pools and exhaust DB connections under load.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
  });

// In development, hot-reload (ts-node-dev) re-imports this module on each restart,
// which would create a new PrismaClient and exhaust connections. Persisting on
// globalThis sidesteps this by reusing the existing instance.
if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
