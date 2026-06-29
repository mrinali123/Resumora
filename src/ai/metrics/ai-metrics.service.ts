// ─── AI Metrics Service ───────────────────────────────────────────────────────
//
// Stores one row per LLM request in ai_metrics.
// All writes are fire-and-forget — metric loss is acceptable, revenue loss is not.
// Never block the response on metric writes.
//
// Phase 6: stream these rows into a time-series store (e.g. TimescaleDB or
// Prometheus push gateway) and build a Grafana dashboard.

import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';

export interface RecordMetricInput {
  userId: string;
  endpoint: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  cached: boolean;
  success: boolean;
  errorMessage?: string;
}

export class AIMetricsService {
  // Fire-and-forget: never await this in a request path
  record(input: RecordMetricInput): void {
    prisma.aIMetric
      .create({
        data: {
          userId: input.userId,
          endpoint: input.endpoint,
          provider: input.provider,
          model: input.model,
          promptTokens: input.promptTokens,
          completionTokens: input.completionTokens,
          totalTokens: input.totalTokens,
          latencyMs: input.latencyMs,
          cached: input.cached,
          success: input.success,
          errorMessage: input.errorMessage,
        },
      })
      .catch((err) => {
        logger.warn({ err }, 'Failed to record AI metric — ignoring');
      });
  }

  // ── Dashboard helpers ──────────────────────────────────────────────────────

  async getSummary(userId: string, days = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await prisma.aIMetric.findMany({
      where: { userId, createdAt: { gte: since } },
      select: {
        endpoint: true,
        provider: true,
        totalTokens: true,
        latencyMs: true,
        cached: true,
        success: true,
        createdAt: true,
      },
    });

    const total = rows.length;
    const cached = rows.filter((r) => r.cached).length;
    const failed = rows.filter((r) => !r.success).length;
    const totalTokens = rows.reduce((s, r) => s + r.totalTokens, 0);
    const avgLatencyMs =
      total > 0 ? rows.reduce((s, r) => s + r.latencyMs, 0) / total : 0;

    // Group by endpoint
    const byEndpoint: Record<string, { calls: number; tokens: number; avgLatencyMs: number }> = {};
    for (const r of rows) {
      const e = (byEndpoint[r.endpoint] ??= { calls: 0, tokens: 0, avgLatencyMs: 0 });
      e.calls++;
      e.tokens += r.totalTokens;
      e.avgLatencyMs = (e.avgLatencyMs * (e.calls - 1) + r.latencyMs) / e.calls;
    }

    return {
      periodDays: days,
      totalCalls: total,
      cachedCalls: cached,
      cacheHitRate: total > 0 ? cached / total : 0,
      failedCalls: failed,
      totalTokensUsed: totalTokens,
      avgLatencyMs: Math.round(avgLatencyMs),
      byEndpoint,
    };
  }
}

export const aiMetricsService = new AIMetricsService();
