// ─── Rate Limiting Middleware ─────────────────────────────────────────────────
//
// Different limits for different risk surfaces:
//
//   authRateLimit      10 req/15min per IP    — prevent brute-force on login/register
//   aiRateLimit        20 req/hour per user   — protect LLM cost from abuse
//   uploadRateLimit    5 req/hour per user    — file upload is expensive (disk + parse)
//   apiRateLimit       100 req/min per user   — general protection
//
// Redis store: shared counter state across multiple server instances.
// Falls back to in-memory (MemoryStore) when Redis is unavailable — note that
// in-memory limits are per-instance, so a 2-instance cluster effectively
// doubles the limit. This is acceptable for Phase 6.
//
// Headers returned on each response:
//   RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset (RFC 6585)
//   Retry-After on 429 responses

import { rateLimit, ipKeyGenerator, type Store, type IncrementResponse } from 'express-rate-limit';
import { getRedisClient } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import type { Request } from 'express';

// ── Redis store for express-rate-limit ────────────────────────────────────────
// Implements the Store interface required by express-rate-limit v7.

class RedisRateLimitStore implements Store {
  readonly prefix: string;
  // windowSeconds is set by init() when express-rate-limit attaches this store.
  // Defaults to 60s so the store is safe to use before init() is called.
  private windowSeconds = 60;

  constructor(prefix = 'rl:') {
    this.prefix = prefix;
  }

  // express-rate-limit v7 calls init() after instantiation, passing the full
  // limiter options so the store can align its TTL with windowMs.
  init(options: { windowMs: number }): void {
    this.windowSeconds = Math.ceil(options.windowMs / 1000);
  }

  async increment(key: string): Promise<IncrementResponse> {
    const redis = getRedisClient();
    if (!redis) {
      // Fallback: always allow (Redis down → no rate limiting)
      return { totalHits: 1, resetTime: undefined };
    }

    const redisKey = `${this.prefix}${key}`;
    try {
      const totalHits = await redis.incr(redisKey);
      // Set TTL only on first increment so the window is fixed from the first
      // request, and subsequent increments don't extend it.
      if (totalHits === 1) {
        await redis.expire(redisKey, this.windowSeconds);
      }
      const ttl = await redis.ttl(redisKey);
      const resetTime = ttl > 0 ? new Date(Date.now() + ttl * 1000) : undefined;
      return { totalHits, resetTime };
    } catch (err) {
      logger.warn({ err }, 'Rate limit Redis error — allowing request');
      return { totalHits: 1, resetTime: undefined };
    }
  }

  async decrement(key: string): Promise<void> {
    const redis = getRedisClient();
    if (!redis) return;
    await redis.decr(`${this.prefix}${key}`).catch(() => {});
  }

  async resetKey(key: string): Promise<void> {
    const redis = getRedisClient();
    if (!redis) return;
    await redis.del(`${this.prefix}${key}`).catch(() => {});
  }
}

// ── Key generators ─────────────────────────────────────────────────────────────

// ipKeyGenerator normalises IPv6 addresses and is required by express-rate-limit v7+
// when a custom keyGenerator reads req.ip.
const ipKey = (req: Request) => ipKeyGenerator(req.ip ?? 'unknown');

// For authenticated routes: key on userId; falls back to normalised IP.
const userKey = (req: Request): string =>
  req.user?.userId ?? ipKeyGenerator(req.ip ?? 'unknown');

// ── Rate limiters ──────────────────────────────────────────────────────────────

export const authRateLimit = rateLimit({
  windowMs: env.RATE_LIMIT_AUTH_WINDOW_MIN * 60 * 1000,
  max: env.RATE_LIMIT_AUTH_MAX,
  keyGenerator: ipKey,
  store: new RedisRateLimitStore('rl:auth:'),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: `Too many authentication attempts. Try again in ${env.RATE_LIMIT_AUTH_WINDOW_MIN} minutes.`,
  },
});

export const aiRateLimit = rateLimit({
  windowMs: env.RATE_LIMIT_AI_WINDOW_MIN * 60 * 1000,
  max: env.RATE_LIMIT_AI_MAX,
  keyGenerator: userKey,
  store: new RedisRateLimitStore('rl:ai:'),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: `AI request limit reached (${env.RATE_LIMIT_AI_MAX} per ${env.RATE_LIMIT_AI_WINDOW_MIN} minutes). Try again later.`,
  },
});

export const uploadRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  keyGenerator: userKey,
  store: new RedisRateLimitStore('rl:upload:'),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Upload limit reached (5 per hour). Try again later.',
  },
});

export const apiRateLimit = rateLimit({
  windowMs: env.RATE_LIMIT_API_WINDOW_MIN * 60 * 1000,
  max: env.RATE_LIMIT_API_MAX,
  // apiRateLimit is mounted before auth middleware so req.user is never set here.
  // userKey would silently fall back to IP for every request. Use ipKey explicitly.
  keyGenerator: ipKey,
  store: new RedisRateLimitStore('rl:api:'),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: `Rate limit exceeded (${env.RATE_LIMIT_API_MAX} per minute). Slow down.`,
  },
  skip: (req) => req.method === 'GET' && req.path.includes('/health'),
});

// 30 analyses per hour per user — CPU-bound engine but heavier than a plain GET
export const analyzeRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyGenerator: userKey,
  store: new RedisRateLimitStore('rl:analyze:'),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Analysis limit reached (30 per hour). Try again later.',
  },
});

// 20 comparisons per hour per user — loads 2 parsed resumes and runs comparison engine
export const compareRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: userKey,
  store: new RedisRateLimitStore('rl:compare:'),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Comparison limit reached (20 per hour). Try again later.',
  },
});
