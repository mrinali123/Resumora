// ─── Worker Manager ───────────────────────────────────────────────────────────
//
// Single entry point for starting and stopping all BullMQ workers.
// Called from server.ts during startup and graceful shutdown.
//
// Architecture note: in Phase 6, workers run in the same process as the HTTP
// server. This is fine for moderate load — the workers use async I/O and don't
// block the event loop. For Phase 7, extract workers into a separate process
// (or container) so they can be scaled independently from the API tier.
// BullMQ makes this trivial: workers connect to the same Redis queue regardless
// of which process/host they run on.

import type { Worker } from 'bullmq';
import { logger } from '../utils/logger';
import { startResumeProcessingWorker } from './workers/resume-processing.worker';
import { startAtsAnalysisWorker } from './workers/ats-analysis.worker';

interface WorkerRegistry {
  workers: Worker[];
  stop(): Promise<void>;
}

let _registry: WorkerRegistry | null = null;

export function startWorkers(): WorkerRegistry | null {
  if (_registry) return _registry;

  const workers: Worker[] = [];

  const resumeWorker = startResumeProcessingWorker();
  if (resumeWorker) workers.push(resumeWorker);

  const atsWorker = startAtsAnalysisWorker();
  if (atsWorker) workers.push(atsWorker);

  if (workers.length === 0) {
    logger.warn('No workers started — Redis unavailable or REDIS_URL not set');
    return null;
  }

  _registry = {
    workers,
    async stop() {
      logger.info('Stopping workers...');
      await Promise.all(workers.map((w) => w.close()));
      _registry = null;
      logger.info('All workers stopped');
    },
  };

  logger.info({ count: workers.length }, 'Workers started');
  return _registry;
}

export async function stopWorkers(): Promise<void> {
  if (_registry) await _registry.stop();
}
