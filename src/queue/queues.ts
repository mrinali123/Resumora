// ─── BullMQ Queue Instances ───────────────────────────────────────────────────
//
// One Queue instance per queue name. Queues are used by producers (controllers,
// services) to enqueue jobs. Workers consume from these same queue names.
//
// Design decisions:
//   - defaultJobOptions.attempts = 3: transient failures (network blip, API rate
//     limit) are retried. Persistent failures (bug in worker code) should be
//     caught by error tracking, not retried infinitely.
//   - exponentialDelay: backs off between retries to avoid thundering-herd when
//     an upstream dependency (OpenAI, DB) recovers.
//   - removeOnComplete/Fail age: completed jobs are deleted after 24h to prevent
//     Redis memory growth. Failed jobs are kept 7 days for post-mortem analysis.
//   - Queue instances are singletons per process, created lazily on first call
//     to getQueues(). Returns null when Redis is unavailable.
//
// Why getBullConnectionOptions() instead of passing a Redis instance?
//   BullMQ bundles its own copy of ioredis internally, making the type of a
//   top-level `ioredis.Redis` instance structurally incompatible with BullMQ's
//   expected `ConnectionOptions`. Passing plain options avoids this conflict;
//   BullMQ creates its own connections from them.

import { Queue, type QueueOptions } from 'bullmq';
import { getBullConnectionOptions, isRedisAvailable } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { QUEUES } from './jobs.types';

export interface AppQueues {
  resumeProcessing: Queue;
  embedding: Queue;
  aiAnalysis: Queue;
}

let _queues: AppQueues | null = null;

const sharedJobOptions: QueueOptions['defaultJobOptions'] = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,  // 2s → 4s → 8s
  },
  removeOnComplete: { age: env.QUEUE_REMOVE_ON_COMPLETE_AGE / 1000 },
  removeOnFail: { age: env.QUEUE_REMOVE_ON_FAIL_AGE / 1000 },
};

export function getQueues(): AppQueues | null {
  if (_queues) return _queues;

  // Guard 1: no REDIS_URL configured at all
  const connection = getBullConnectionOptions();
  if (!connection) {
    logger.warn('REDIS_URL not set — BullMQ queues disabled (sync fallback active)');
    return null;
  }

  // Guard 2: REDIS_URL is set but Redis didn't connect on startup.
  // Without this check, Queue instances are created and queue.add() hangs
  // indefinitely because BullMQ uses maxRetriesPerRequest: null — it buffers
  // Redis commands forever instead of throwing when the connection is down.
  if (!isRedisAvailable()) {
    logger.warn('Redis not connected — BullMQ queues disabled (sync fallback active)');
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conn = connection as any;

  _queues = {
    resumeProcessing: new Queue(QUEUES.RESUME_PROCESSING, {
      connection: conn,
      defaultJobOptions: sharedJobOptions,
    }),
    embedding: new Queue(QUEUES.EMBEDDING, {
      connection: conn,
      defaultJobOptions: sharedJobOptions,
    }),
    aiAnalysis: new Queue(QUEUES.AI_ANALYSIS, {
      connection: conn,
      defaultJobOptions: sharedJobOptions,
    }),
  };

  logger.info('BullMQ queues initialized');
  return _queues;
}

export async function closeQueues(): Promise<void> {
  if (_queues) {
    await Promise.all([
      _queues.resumeProcessing.close(),
      _queues.embedding.close(),
      _queues.aiAnalysis.close(),
    ]);
    _queues = null;
    logger.info('BullMQ queues closed');
  }
}
