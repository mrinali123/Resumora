// ─── Request Context Middleware ───────────────────────────────────────────────
//
// Attaches a unique request ID and start timestamp to every request.
// The request ID flows through: HTTP header → pino logs → BullMQ jobs → errors.
// This enables end-to-end tracing of a single request across logs.
//
// Convention: clients can supply X-Request-Id; if absent, we generate one.
// The ID is echoed back in the response header so clients can correlate.

import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { metricsService } from '../metrics/metrics.service';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime: number;
    }
  }
}

export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  req.requestId = (req.headers['x-request-id'] as string) ?? randomUUID();
  req.startTime = Date.now();

  res.setHeader('X-Request-Id', req.requestId);
  next();
}

// ── Request metrics middleware ─────────────────────────────────────────────────
// Records per-route latency. Applied globally after request-context middleware.

export function requestMetricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.on('finish', () => {
    const latencyMs = Date.now() - (req.startTime ?? Date.now());
    const routeKey = `${req.method}.${res.statusCode}`;

    metricsService.recordLatency(`api.latency`, latencyMs);
    metricsService.recordLatency(`api.${routeKey}`, latencyMs);
    metricsService.increment(`api.requests.total`);
    metricsService.increment(`api.requests.${routeKey}`);

    if (res.statusCode >= 500) metricsService.increment('api.errors.5xx');
    else if (res.statusCode >= 400) metricsService.increment('api.errors.4xx');
  });
  next();
}
