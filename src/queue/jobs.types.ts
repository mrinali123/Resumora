// ─── Queue Job Type Definitions ───────────────────────────────────────────────
//
// Each job payload is typed end-to-end: producer → queue → worker.
// Strong typing here prevents mismatched payloads — a class of runtime bug that
// is painful to debug in distributed async systems.
//
// Versioning note: add a `version` field to payloads before changing their shape.
// Workers should handle both old and new versions during rolling deployments.

// ── Queue Names ───────────────────────────────────────────────────────────────

export const QUEUES = {
  RESUME_PROCESSING: 'resume-processing',
  EMBEDDING: 'embedding',
  AI_ANALYSIS: 'ai-analysis',
} as const;

export type QueueName = typeof QUEUES[keyof typeof QUEUES];

// ── Job Names (sub-type within each queue) ────────────────────────────────────

export const JOB_NAMES = {
  // resume-processing queue
  PROCESS_RESUME: 'process-resume',
  // embedding queue
  EMBED_RESUME_CHUNKS: 'embed-resume-chunks',
  EMBED_JOB_CHUNKS: 'embed-job-chunks',
  // ai-analysis queue (Phase 4 legacy)
  RUN_ATS_ANALYSIS: 'run-ats-analysis',
  // ai-analysis queue (Phase 7): run explain_score() + simulate_recruiter()
  ANALYZE_RESUME: 'analyze-resume',
} as const;

// ── Job Payloads ──────────────────────────────────────────────────────────────

// resume-processing queue: orchestrate full pipeline for a new upload
export interface ProcessResumePayload {
  version: '1';
  resumeId: string;
  userId: string;
  filePath: string;
  originalFileName: string;
  mimeType: string;
  // Forwarded to API response via GET /jobs/:id/result
  correlationId: string;
}

// embedding queue: generate vectors for chunks that have no embedding yet
export interface EmbedResumeChunksPayload {
  version: '1';
  resumeId: string;
  chunkIds: string[];  // specific chunk IDs to embed (empty = all unembedded)
}

export interface EmbedJobChunksPayload {
  version: '1';
  jobId: string;
  chunkIds: string[];
}

// ai-analysis queue: run ATS analysis (+ optional AI features)
export interface RunATSAnalysisPayload {
  version: '1';
  resumeId: string;
  jobId: string;
  userId: string;
  includeAI: boolean;
}

// ai-analysis queue (Phase 7): run explain_score() + simulate_recruiter()
export interface AnalyzeResumePayload {
  version: '1';
  resumeId: string;
  userId: string;
  jobDescription?: string;
  correlationId: string;
}

export interface AnalyzeResumeResult {
  analysisId: string;
  resumeId: string;
  overallScore: number;
  grade: string;
  recruiterDecision: string;
}

// ── Job Status ────────────────────────────────────────────────────────────────

export type JobStatus =
  | 'waiting'     // queued, not yet picked up
  | 'active'      // currently being processed
  | 'completed'   // finished successfully
  | 'failed'      // terminal failure after all retries
  | 'delayed';    // scheduled to run in the future

export interface JobStatusRecord {
  id: string;
  userId?: string;       // set on creation; used to enforce ownership in GET /queue-jobs/:id/*
  queue: QueueName;
  jobName: string;
  status: JobStatus;
  progress: number;      // 0–100
  message: string;       // human-readable current step
  createdAt: string;     // ISO 8601
  updatedAt: string;
  completedAt?: string;
  failedReason?: string;
}

// ── Job Results ───────────────────────────────────────────────────────────────

export interface ProcessResumeResult {
  resumeId: string;
  status: 'PROCESSED' | 'FAILED';
  title: string;
  chunkCount: number;
  embeddedChunkCount: number;
}
