// ─── Resume Processing Worker ─────────────────────────────────────────────────
//
// Consumes jobs from the `resume-processing` queue.
// Orchestrates the full pipeline that was previously inline in the HTTP handler:
//   1. Extract text (PDF/DOCX)
//   2. Parse structured fields
//   3. Chunk into semantic sections
//   4. Generate embeddings (best-effort, non-blocking)
//   5. Mark resume PROCESSED
//   6. Run baseline ATS analysis (best-effort, non-blocking)
//      — writes an AtsAnalysis row so History shows a score immediately
//        without requiring a separate manual analysis step.
//
// The stub resume record is created by the HTTP handler before enqueueing.
// This worker operates on that existing record (no duplicate creation).
//
// Retry strategy: 3 attempts, exponential backoff (2s → 4s → 8s).

import { Worker, type Job } from 'bullmq';
import { getBullConnectionOptions } from '../../config/redis';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { prisma } from '../../config/database';
import { resumeUploadService } from '../../services/resume-upload.service';
import { atsAnalysisService } from '../../services/ats-analysis.service';
import { jobTracker } from '../job-tracker';
import { metricsService } from '../../metrics/metrics.service';
import { QUEUES, JOB_NAMES } from '../jobs.types';
import type { ProcessResumePayload, ProcessResumeResult } from '../jobs.types';

export function startResumeProcessingWorker(): Worker | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connection = getBullConnectionOptions() as any;
  if (!connection) return null;

  const worker = new Worker<ProcessResumePayload, ProcessResumeResult>(
    QUEUES.RESUME_PROCESSING,
    async (job: Job<ProcessResumePayload>) => {
      // userId was always in the payload but was never destructured — it is
      // required for the auto-ATS step added at the end of this worker.
      const { resumeId, userId, filePath, originalFileName, mimeType } = job.data;
      const startMs = Date.now();

      logger.info({ jobId: job.id, resumeId, userId }, 'Resume processing started');

      await jobTracker.setStatus(job.id!, {
        status: 'active',
        queue: QUEUES.RESUME_PROCESSING,
        jobName: JOB_NAMES.PROCESS_RESUME,
        progress: 5,
        message: 'Starting text extraction',
      });

      try {
        await job.updateProgress(5);

        // ── Steps 1–5: extract, parse, chunk, embed, mark PROCESSED ──────────
        const result = await resumeUploadService.processExistingResume(
          resumeId,
          { path: filePath, originalname: originalFileName, mimetype: mimeType },
          async (step: string, pct: number) => {
            // Scale upload pipeline progress to 5–85 so the ATS step has room.
            const scaled = Math.round(5 + (pct / 100) * 80);
            await job.updateProgress(scaled);
            await jobTracker.updateProgress(job.id!, scaled, step);
          },
        );

        logger.info(
          { jobId: job.id, resumeId, status: result.status },
          'Resume text pipeline complete — starting baseline ATS analysis',
        );

        // ── Step 6: Baseline ATS analysis (best-effort) ───────────────────────
        //
        // Runs without a job description to give a general-purpose score that
        // History can display immediately.  This step MUST NOT throw — any
        // failure is logged as a warning and the upload job still succeeds so
        // the user isn't penalised for an analysis engine error.
        await job.updateProgress(88);
        await jobTracker.updateProgress(job.id!, 88, 'Running baseline ATS analysis');

        const atsStart = Date.now();
        try {
          const atsResult = await atsAnalysisService.analyze(userId, resumeId, undefined);
          const atsDurationMs = Date.now() - atsStart;

          logger.info(
            {
              jobId:      job.id,
              resumeId,
              userId,
              analysisId: atsResult.analysisId,
              atsScore:   atsResult.overallScore,
              grade:      atsResult.grade,
              decision:   atsResult.recruiter.decision,
              durationMs: atsDurationMs,
            },
            'Baseline ATS analysis persisted — History will show score immediately',
          );
          metricsService.increment('ats.analysis.auto_upload.success');
        } catch (atsErr) {
          // Non-fatal: the resume is fully PROCESSED; the user can run analysis
          // manually from the ATS Analysis page.
          logger.warn(
            {
              err:        (atsErr as Error).message,
              jobId:      job.id,
              resumeId,
              userId,
              durationMs: Date.now() - atsStart,
            },
            'Baseline ATS analysis failed after upload — non-fatal; manual analysis still available',
          );
          metricsService.increment('ats.analysis.auto_upload.failed');
        }

        // ── Finalise job ──────────────────────────────────────────────────────
        await job.updateProgress(100);
        await jobTracker.updateProgress(job.id!, 100, 'Complete');

        const jobResult: ProcessResumeResult = {
          resumeId: result.id,
          status:   result.status as 'PROCESSED' | 'FAILED',
          title:    result.title,
          chunkCount:         (result.metadata as { chunkCount?: number })?.chunkCount ?? 0,
          embeddedChunkCount: (result.metadata as { embeddedChunkCount?: number })?.embeddedChunkCount ?? 0,
        };

        await jobTracker.markCompleted(job.id!, jobResult);

        const latencyMs = Date.now() - startMs;
        metricsService.recordLatency('queue.resume_processing', latencyMs);
        metricsService.increment('queue.resume_processing.completed');

        logger.info({ jobId: job.id, resumeId, latencyMs }, 'Resume processing job completed');
        return jobResult;
      } catch (err) {
        const reason = (err as Error).message ?? String(err);
        logger.error({ err, jobId: job.id, resumeId }, 'Resume processing failed');
        metricsService.increment('queue.resume_processing.failed');
        await jobTracker.markFailed(job.id!, reason);

        // _runPipeline already sets status = 'FAILED', but if the DB update
        // inside _runPipeline itself failed the resume stays PENDING. This
        // second attempt is a safety net — failing here is also swallowed so
        // the worker never crashes from a status-update error.
        try {
          await prisma.resume.update({
            where: { id: resumeId },
            data: { status: 'FAILED', metadata: { error: reason, failedAt: new Date().toISOString() } },
          });
        } catch (statusErr) {
          logger.error({ err: statusErr, resumeId }, 'Could not update resume status to FAILED');
        }

        throw err;
      }
    },
    {
      connection,
      concurrency: env.QUEUE_CONCURRENCY,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, err, attempts: job?.attemptsMade },
      'Resume processing job permanently failed',
    );
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Resume processing worker error');
  });

  logger.info('Resume processing worker started');
  return worker;
}
