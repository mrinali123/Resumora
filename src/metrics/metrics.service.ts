// ─── Metrics Service ──────────────────────────────────────────────────────────
//
// Lightweight in-process metrics store. Designed for Phase 6 where the goal is
// to *capture* all meaningful signals, even if the storage/dashboard layer isn't
// fully built yet.
//
// Architecture:
//   - Counters and histograms live in process memory (Map<string, number>).
//   - This means metrics reset on restart — acceptable for Phase 6.
//   - Phase 7: push to Prometheus push gateway or write to TimescaleDB on flush.
//
// Why not use a library (prom-client, statsd)?
//   They add significant API surface area for a service that isn't yet receiving
//   production traffic. This module gives us the same data model with ~100 lines
//   and can be swapped for prom-client with a 1:1 refactor.
//
// Usage:
//   metricsService.increment('cache.hit')
//   metricsService.recordLatency('api.POST.analysis.job-fit', 145)
//   metricsService.getSnapshot()   // for GET /health/metrics

export interface MetricsSnapshot {
  counters: Record<string, number>;
  latencies: Record<string, LatencySummary>;
  uptime: number;
  timestamp: string;
}

export interface LatencySummary {
  count: number;
  sum: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export class MetricsService {
  private counters = new Map<string, number>();
  private histograms = new Map<string, number[]>();
  private readonly startTime = Date.now();

  // ── Counters ───────────────────────────────────────────────────────────────

  increment(name: string, by = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + by);
  }

  // ── Latency ────────────────────────────────────────────────────────────────

  recordLatency(name: string, ms: number): void {
    if (!this.histograms.has(name)) this.histograms.set(name, []);
    const arr = this.histograms.get(name)!;
    arr.push(ms);
    // Bound memory: keep only the last 1000 samples per metric
    if (arr.length > 1000) arr.splice(0, arr.length - 1000);
  }

  // ── Snapshot ───────────────────────────────────────────────────────────────

  getSnapshot(): MetricsSnapshot {
    const counters: Record<string, number> = {};
    for (const [k, v] of this.counters) counters[k] = v;

    const latencies: Record<string, LatencySummary> = {};
    for (const [k, arr] of this.histograms) {
      if (arr.length > 0) latencies[k] = this.summarise(arr);
    }

    return {
      counters,
      latencies,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      timestamp: new Date().toISOString(),
    };
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private summarise(arr: number[]): LatencySummary {
    const sorted = [...arr].sort((a, b) => a - b);
    const sum = sorted.reduce((s, v) => s + v, 0);
    return {
      count: sorted.length,
      sum: Math.round(sum),
      avg: Math.round(sum / sorted.length),
      p50: this.percentile(sorted, 0.5),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99),
      max: sorted[sorted.length - 1],
    };
  }

  private percentile(sorted: number[], p: number): number {
    const idx = Math.floor(sorted.length * p);
    return sorted[Math.min(idx, sorted.length - 1)];
  }
}

export const metricsService = new MetricsService();
