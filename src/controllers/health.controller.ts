import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { prisma } from '../config/database';
import { getRedisClient } from '../config/redis';
import { metricsService } from '../metrics/metrics.service';
import { getQueues } from '../queue/queues';

// ── GET /health ───────────────────────────────────────────────────────────────
// Shallow: always returns 200 if the process is alive.
// Used by load balancers and container orchestrators (k8s liveness probe).

export const shallowHealth = (_req: Request, res: Response): void => {
  res.json({
    status: 'ok',
    version: process.env['npm_package_version'] ?? '1.0.0',
    timestamp: new Date().toISOString(),
  });
};

// ── GET /health/deep ──────────────────────────────────────────────────────────
// Deep: checks all dependencies. Returns 503 if any critical dependency is down.
// Used by k8s readiness probes — unhealthy pods are removed from load balancer.
// Do NOT use as liveness probe (a slow DB query could cause unnecessary restarts).

export const deepHealth = asyncHandler(async (_req: Request, res: Response) => {
  const checks = await Promise.allSettled([
    checkDatabase(),
    checkRedis(),
  ]);

  const [dbCheck, redisCheck] = checks;

  const result = {
    status: 'ok' as 'ok' | 'degraded' | 'unhealthy',
    checks: {
      database: dbCheck.status === 'fulfilled' ? dbCheck.value : { status: 'unhealthy', error: (dbCheck.reason as Error).message },
      redis: redisCheck.status === 'fulfilled' ? redisCheck.value : { status: 'degraded', error: (redisCheck.reason as Error).message },
    },
    timestamp: new Date().toISOString(),
  };

  // Database is critical — unhealthy if DB is down
  if (result.checks.database.status === 'unhealthy') {
    result.status = 'unhealthy';
  }
  // Redis is non-critical — degraded if Redis is down (caching disabled)
  else if (result.checks.redis.status !== 'ok') {
    result.status = 'degraded';
  }

  res.status(result.status === 'unhealthy' ? 503 : 200).json(result);
});

// ── GET /health/metrics ───────────────────────────────────────────────────────
// Returns in-process metrics snapshot. Intended for internal dashboards.
// In production: restrict to internal network or admin JWT.

export const getMetrics = asyncHandler(async (_req: Request, res: Response) => {
  const snapshot = metricsService.getSnapshot();

  // Enrich with queue depths if Redis is available
  const queues = getQueues();
  const queueMetrics: Record<string, unknown> = {};

  if (queues) {
    const [resumeWaiting, resumeActive] = await Promise.allSettled([
      queues.resumeProcessing.getWaitingCount(),
      queues.resumeProcessing.getActiveCount(),
    ]);
    queueMetrics['resume-processing'] = {
      waiting: resumeWaiting.status === 'fulfilled' ? resumeWaiting.value : 'n/a',
      active: resumeActive.status === 'fulfilled' ? resumeActive.value : 'n/a',
    };
  }

  res.json({
    success: true,
    data: {
      ...snapshot,
      queues: queueMetrics,
    },
  });
});

// ── Dependency checks ─────────────────────────────────────────────────────────

async function checkDatabase() {
  const start = Date.now();
  await prisma.$queryRaw`SELECT 1`;
  return { status: 'ok', latencyMs: Date.now() - start };
}

async function checkRedis() {
  const redis = getRedisClient();
  if (!redis) return { status: 'disabled', latencyMs: 0 };

  const start = Date.now();
  await redis.ping();
  return { status: 'ok', latencyMs: Date.now() - start };
}
