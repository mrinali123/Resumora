// ─── Job Tracker ──────────────────────────────────────────────────────────────
//
// Stores job status and result in Redis so clients can poll via:
//   GET /api/v1/jobs/:id/status
//   GET /api/v1/jobs/:id/result
//
// Why Redis instead of PostgreSQL?
//   Job status is high-write, short-lived data. A typical resume upload triggers
//   ~10 status updates (WAITING → ACTIVE → step1 → step2 ... → COMPLETED).
//   Storing this in Postgres would add 10 rows per job that are deleted 24h later.
//   Redis's TTL + simple string values are the right fit here.
//
// Durability trade-off: if Redis restarts during an active job, the status is
//   lost. The job itself survives in BullMQ (Redis-backed), but the client may
//   get a 404 on the status endpoint. For Phase 7, mirror terminal states
//   (COMPLETED, FAILED) to Postgres for durable retrieval.

import { getRedisClient } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import type { JobStatusRecord, JobStatus, QueueName } from './jobs.types';

export class JobTrackerService {
  // ── Status ─────────────────────────────────────────────────────────────────

  async setStatus(
    jobId: string,
    update: Partial<JobStatusRecord> & { status: JobStatus },
  ): Promise<void> {
    const redis = getRedisClient();
    if (!redis) return;

    try {
      const key = `queue:job:${jobId}:status`;
      const existing = await this.getStatus(jobId);
      const now = new Date().toISOString();

      const record: JobStatusRecord = {
        id: jobId,
        userId: update.userId ?? existing?.userId,
        queue: (update.queue ?? existing?.queue ?? 'unknown') as QueueName,
        jobName: update.jobName ?? existing?.jobName ?? 'unknown',
        status: update.status,
        progress: update.progress ?? existing?.progress ?? 0,
        message: update.message ?? existing?.message ?? '',
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        completedAt: update.completedAt ?? existing?.completedAt,
        failedReason: update.failedReason ?? existing?.failedReason,
      };

      await redis.setex(key, env.JOB_STATUS_TTL, JSON.stringify(record));
    } catch (err) {
      logger.warn({ err, jobId }, 'Failed to write job status');
    }
  }

  async getStatus(jobId: string): Promise<JobStatusRecord | null> {
    const redis = getRedisClient();
    if (!redis) return null;

    try {
      const raw = await redis.get(`queue:job:${jobId}:status`);
      return raw ? (JSON.parse(raw) as JobStatusRecord) : null;
    } catch (err) {
      logger.warn({ err, jobId }, 'Failed to read job status');
      return null;
    }
  }

  // ── Result ─────────────────────────────────────────────────────────────────

  async setResult<T>(jobId: string, result: T): Promise<void> {
    const redis = getRedisClient();
    if (!redis) return;

    try {
      // Result TTL = 1 hour (shorter than status TTL)
      // After the client fetches the result, it can retrieve data from the
      // main API using the IDs returned in the result.
      await redis.setex(`queue:job:${jobId}:result`, 3600, JSON.stringify(result));
    } catch (err) {
      logger.warn({ err, jobId }, 'Failed to write job result');
    }
  }

  async getResult<T>(jobId: string): Promise<T | null> {
    const redis = getRedisClient();
    if (!redis) return null;

    try {
      const raw = await redis.get(`queue:job:${jobId}:result`);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      logger.warn({ err, jobId }, 'Failed to read job result');
      return null;
    }
  }

  // ── Progress helpers (called from worker processors) ───────────────────────

  async updateProgress(jobId: string, progress: number, message: string): Promise<void> {
    await this.setStatus(jobId, { status: 'active', progress, message });
  }

  async markCompleted<T>(jobId: string, result: T): Promise<void> {
    await Promise.all([
      this.setStatus(jobId, {
        status: 'completed',
        progress: 100,
        message: 'Completed',
        completedAt: new Date().toISOString(),
      }),
      this.setResult(jobId, result),
    ]);
  }

  async markFailed(jobId: string, reason: string): Promise<void> {
    await this.setStatus(jobId, {
      status: 'failed',
      message: 'Failed',
      failedReason: reason,
      completedAt: new Date().toISOString(),
    });
  }
}

export const jobTracker = new JobTrackerService();
