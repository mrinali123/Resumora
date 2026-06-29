// ─── ATS Analysis Worker ──────────────────────────────────────────────────────
//
// Consumes ANALYZE_RESUME jobs from the `ai-analysis` queue.
// Delegates to atsAnalysisService.analyze(), which handles cache check,
// engine execution, DB persistence, and logging.
//
// Why concurrency: 4?
//   explain_score() + simulate_recruiter() are synchronous CPU-bound operations
//   (~20–60 ms each). At 4 concurrent workers, throughput is ~60–180 analyses/s
//   on a single core. If CPU becomes the bottleneck, move workers to a separate
//   process with Node's child_process.fork() or a PM2 cluster.

import { Worker, type Job } from 'bullmq';
import { getBullConnectionOptions } from '../../config/redis';
import { logger } from '../../utils/logger';
import { atsAnalysisService } from '../../services/ats-analysis.service';
import { jobTracker } from '../job-tracker';
import { metricsService } from '../../metrics/metrics.service';
import { QUEUES, JOB_NAMES } from '../jobs.types';
import type { AnalyzeResumePayload, AnalyzeResumeResult } from '../jobs.types';

export function startAtsAnalysisWorker(): Worker | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connection = getBullConnectionOptions() as any;
  if (!connection) return null;

  const worker = new Worker<AnalyzeResumePayload, AnalyzeResumeResult>(
    QUEUES.AI_ANALYSIS,
    async (job: Job<AnalyzeResumePayload>) => {
      if (job.name !== JOB_NAMES.ANALYZE_RESUME) {
        // This worker only handles ANALYZE_RESUME; skip other job types that
        // might land on the same queue in future.
        throw new Error(`Unexpected job name on ats-analysis worker: ${job.name}`);
      }

      const { resumeId, userId, jobDescription } = job.data;

      logger.info({ jobId: job.id, resumeId, userId }, 'Async ATS analysis started');

      await jobTracker.setStatus(job.id!, {
        status: 'active',
        queue: QUEUES.AI_ANALYSIS,
        jobName: JOB_NAMES.ANALYZE_RESUME,
        progress: 10,
        message: 'Loading resume and running engines',
      });

      await job.updateProgress(10);

      const analysis = await atsAnalysisService.analyze(userId, resumeId, jobDescription);

      await job.updateProgress(100);

      const result: AnalyzeResumeResult = {
        analysisId:       analysis.analysisId,
        resumeId:         analysis.resumeId,
        overallScore:     analysis.overallScore,
        grade:            analysis.grade,
        recruiterDecision: analysis.recruiter.decision,
      };

      await jobTracker.markCompleted(job.id!, result);

      return result;
    },
    {
      connection,
      concurrency: 4,
    },
  );

  worker.on('error', (err) => {
    logger.error({ err }, 'ATS analysis worker error');
  });

  worker.on('failed', async (job, err) => {
    if (job) {
      logger.error({ jobId: job.id, err: err.message }, 'ATS analysis job failed');
      metricsService.increment('ats.analysis.job.failed');
      await jobTracker.markFailed(job.id!, err.message);
    }
  });

  worker.on('completed', (job) => {
    metricsService.increment('ats.analysis.job.completed');
    logger.info({ jobId: job.id }, 'ATS analysis job completed');
  });

  logger.info('ATS analysis worker started');
  return worker;
}
