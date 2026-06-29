// ─── Input Sanitization Middleware ────────────────────────────────────────────
//
// Defense-in-depth layer that runs after body parsing but before route handlers.
// This is not a substitute for parameterised queries (Prisma handles SQL injection)
// or Zod validation (each route validates its schema). This middleware catches
// an entirely different class of threat: oversized payloads and obviously
// malicious strings that shouldn't reach business logic at all.
//
// What it does:
//   1. Trims string fields to remove leading/trailing whitespace
//   2. Rejects deeply nested objects (JSON depth attacks)
//   3. Strips NUL bytes (\x00) that can confuse parsers
//   4. Rejects prototype pollution patterns (__proto__, constructor.prototype)
//
// What it does NOT do:
//   - HTML escaping (not needed for a JSON API — no HTML rendering)
//   - XSS prevention (not applicable — response is JSON, not HTML)
//   - SQL injection prevention (Prisma uses parameterised queries exclusively)

import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';

const MAX_DEPTH = 10;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const NUL_REGEX = /\x00/g;

export function sanitizeMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    try {
      req.body = sanitizeObject(req.body, 0);
    } catch (err) {
      return next(new AppError((err as Error).message, 400));
    }
  }
  next();
}

function sanitizeObject(obj: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) {
    throw new Error('Request body is too deeply nested');
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, depth + 1));
  }

  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (DANGEROUS_KEYS.has(key)) {
        throw new Error(`Disallowed key in request body: "${key}"`);
      }
      result[key] = sanitizeObject(value, depth + 1);
    }
    return result;
  }

  if (typeof obj === 'string') {
    return obj.replace(NUL_REGEX, '').trim();
  }

  return obj;
}
