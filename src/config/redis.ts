// ─── Redis Client ─────────────────────────────────────────────────────────────
//
// Two connection factories:
//
//   getRedisClient()      — general-purpose singleton for caching and rate limits.
//                           maxRetriesPerRequest = 3 → calls that hit Redis throw
//                           after a few attempts so the caller can fall back.
//
//   createBullConnection() — fresh connection for BullMQ workers and queues.
//                            maxRetriesPerRequest = null (required by BullMQ) so
//                            queue operations retry indefinitely rather than losing jobs.
//
// Both return null when REDIS_URL is not set so the rest of the system
// degrades gracefully (caching disabled, queues fall back to sync execution).

import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

let _client: Redis | null = null;

// Tracks whether Redis successfully connected during server startup.
// Used by getQueues() to avoid creating BullMQ queues when Redis is down —
// which would cause queue.add() to hang indefinitely (maxRetriesPerRequest: null).
let _redisAvailable = false;

export function setRedisAvailable(val: boolean): void {
  _redisAvailable = val;
}

export function isRedisAvailable(): boolean {
  return _redisAvailable;
}

export function getRedisClient(): Redis | null {
  if (!env.REDIS_URL) return null;

  if (!_client) {
    _client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: env.REDIS_MAX_RETRIES,
      enableReadyCheck: false,  // Don't block startup on cluster ready signal
      lazyConnect: true,
      connectTimeout: env.REDIS_CONNECT_TIMEOUT,
      retryStrategy(times) {
        if (times > 5) return null;  // Give up after 5 retries
        return Math.min(times * 200, 2000);
      },
    });

    _client.on('connect', () => logger.info('Redis connected'));
    _client.on('ready', () => logger.debug('Redis ready'));
    _client.on('error', (err) => logger.error({ err }, 'Redis error'));
    _client.on('close', () => logger.warn('Redis connection closed'));
    _client.on('reconnecting', () => logger.info('Redis reconnecting'));
  }

  return _client;
}

// Connection options for BullMQ — returns a plain object (not a Redis instance).
// Avoids the ioredis dual-version conflict that occurs when bullmq bundles its
// own ioredis copy and our top-level ioredis types become structurally incompatible.
// BullMQ creates its own internal connections from these options.
export function getBullConnectionOptions(): Record<string, unknown> | null {
  if (!env.REDIS_URL) return null;

  try {
    const url = new URL(env.REDIS_URL);
    return {
      host: url.hostname || 'localhost',
      port: url.port ? parseInt(url.port, 10) : 6379,
      ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
      ...(url.pathname && url.pathname.length > 1 ? { db: parseInt(url.pathname.slice(1), 10) || 0 } : {}),
      maxRetriesPerRequest: null,  // BullMQ requirement
      enableReadyCheck: false,
      lazyConnect: false,
    };
  } catch {
    // Fallback for non-standard URL formats (e.g. "redis://localhost")
    return {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  }
}

// Keep createBullConnection for backward compat (returns null; callers should use getBullConnectionOptions)
/** @deprecated Use getBullConnectionOptions() instead */
export function createBullConnection(): null {
  return null;
}

export async function connectRedis(): Promise<boolean> {
  const client = getRedisClient();
  if (!client) {
    logger.warn('REDIS_URL not set — caching and queuing disabled');
    return false;
  }
  try {
    await client.connect();
    logger.info('Redis connection established');
    return true;
  } catch (err) {
    // Non-fatal: server continues without Redis (cache miss = always)
    logger.error({ err }, 'Redis connection failed — continuing without cache');
    return false;
  }
}

export async function disconnectRedis(): Promise<void> {
  if (_client) {
    await _client.quit();
    _client = null;
    logger.info('Redis disconnected');
  }
}
