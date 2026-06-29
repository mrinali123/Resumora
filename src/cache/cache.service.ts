// ─── Generic Cache Service ────────────────────────────────────────────────────
//
// Thin wrapper around Redis that:
//   1. Degrades gracefully when Redis is unavailable (returns null, writes are no-ops)
//   2. Absorbs serialization errors (invalid JSON → null)
//   3. Tracks hit/miss counts for the metrics system
//   4. Provides a getOrSet() pattern to colocate cache logic with data fetching
//
// Design: every method is intentionally fault-tolerant. A Redis outage should
// cause a cache miss, not a request failure. The exception is critical
// infrastructure (BullMQ) which has its own connection and retry logic.
//
// Naming convention: callers import CacheKeys constants to avoid magic strings.

import { getRedisClient } from '../config/redis';
import { logger } from '../utils/logger';
import { metricsService } from '../metrics/metrics.service';

export class CacheService {
  // ── Read ───────────────────────────────────────────────────────────────────

  async get<T>(key: string): Promise<T | null> {
    const redis = getRedisClient();
    if (!redis) return null;

    try {
      const raw = await redis.get(key);
      if (raw === null) {
        metricsService.increment('cache.miss');
        return null;
      }
      metricsService.increment('cache.hit');
      return JSON.parse(raw) as T;
    } catch (err) {
      logger.warn({ err, key }, 'Cache get failed');
      metricsService.increment('cache.error');
      return null;
    }
  }

  // ── Write ──────────────────────────────────────────────────────────────────

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const redis = getRedisClient();
    if (!redis) return;

    try {
      await redis.setex(key, ttlSeconds, JSON.stringify(value));
    } catch (err) {
      logger.warn({ err, key }, 'Cache set failed');
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async del(key: string | string[]): Promise<void> {
    const redis = getRedisClient();
    if (!redis) return;

    try {
      const keys = Array.isArray(key) ? key : [key];
      if (keys.length > 0) await redis.del(...keys);
    } catch (err) {
      logger.warn({ err, key }, 'Cache del failed');
    }
  }

  // Delete all keys matching a glob pattern.
  // Use sparingly — SCAN is non-blocking but still adds latency.
  async delPattern(pattern: string): Promise<number> {
    const redis = getRedisClient();
    if (!redis) return 0;

    try {
      const keys: string[] = [];
      let cursor = '0';
      do {
        const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        keys.push(...batch);
      } while (cursor !== '0');

      if (keys.length > 0) await redis.del(...keys);
      return keys.length;
    } catch (err) {
      logger.warn({ err, pattern }, 'Cache delPattern failed');
      return 0;
    }
  }

  // ── Cache-aside pattern ────────────────────────────────────────────────────

  // Fetch from cache; on miss, call fn(), cache the result, and return it.
  // This is the primary caching pattern used by feature services.
  async getOrSet<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const value = await fn();
    // Write is fire-and-forget — a cache write failure doesn't fail the request
    this.set(key, value, ttlSeconds).catch(() => {});
    return value;
  }

  // ── Existence check ────────────────────────────────────────────────────────

  async exists(key: string): Promise<boolean> {
    const redis = getRedisClient();
    if (!redis) return false;

    try {
      return (await redis.exists(key)) === 1;
    } catch {
      return false;
    }
  }
}

export const cacheService = new CacheService();
