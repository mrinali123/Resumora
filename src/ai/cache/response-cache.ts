// ─── AI Response Cache ────────────────────────────────────────────────────────
//
// DB-backed cache with TTL. Key = SHA-256 of (promptVersion + endpoint + inputs).
// Versioning strategy: the cache key includes the prompt version, so bumping a
// prompt template's `version` field automatically invalidates old cached responses.
//
// Phase 6: replace this with Redis for O(1) lookup and automatic TTL expiry.
// The interface stays the same — only this file changes.

import crypto from 'crypto';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';

export class AIResponseCache {
  // ── Key derivation ─────────────────────────────────────────────────────────

  buildKey(parts: Record<string, unknown>): string {
    const canonical = JSON.stringify(
      Object.entries(parts)
        .sort(([a], [b]) => a.localeCompare(b))
        .reduce<Record<string, unknown>>((acc, [k, v]) => {
          acc[k] = v;
          return acc;
        }, {}),
    );
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  // ── Read ───────────────────────────────────────────────────────────────────

  async get<T>(key: string): Promise<T | null> {
    try {
      const row = await prisma.aIResponseCache.findUnique({
        where: { cacheKey: key },
        select: { response: true, expiresAt: true },
      });

      if (!row) return null;
      if (row.expiresAt < new Date()) {
        // Expired — delete lazily (background, fire-and-forget)
        prisma.aIResponseCache.delete({ where: { cacheKey: key } }).catch(() => {});
        return null;
      }

      return row.response as T;
    } catch (err) {
      logger.warn({ err }, 'AI cache read error — bypassing cache');
      return null;
    }
  }

  // ── Write ──────────────────────────────────────────────────────────────────

  async set<T>(key: string, endpoint: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      await prisma.aIResponseCache.upsert({
        where: { cacheKey: key },
        create: {
          cacheKey: key,
          endpoint,
          response: JSON.parse(JSON.stringify(value)),
          expiresAt,
        },
        update: {
          response: JSON.parse(JSON.stringify(value)),
          expiresAt,
        },
      });
    } catch (err) {
      // Cache write failure is non-fatal — the real response already returned
      logger.warn({ err }, 'AI cache write error — ignoring');
    }
  }

  // ── Eviction ───────────────────────────────────────────────────────────────

  // Call periodically (e.g., daily cron) to clean up expired rows.
  // Phase 6: replace with Redis TTL or a Postgres scheduled job.
  async evictExpired(): Promise<number> {
    const { count } = await prisma.aIResponseCache.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return count;
  }
}

export const aiResponseCache = new AIResponseCache();
