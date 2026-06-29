// ─── Cache Key Constants ──────────────────────────────────────────────────────
//
// Centralised key templates eliminate magic strings across the codebase.
// All keys follow the pattern:  entity:id:sub-resource
//
// Invalidation contract (write these down — they're load-bearing):
//
//   resume:{id}:*         → invalidated on re-upload or delete
//   job:{id}:*            → invalidated on job description update or delete
//   analysis:{r}:{j}:*   → invalidated when scoring version changes or either
//                           document is updated after the analysis was created
//   user:{id}:rate:*      → managed by rate-limit middleware, TTL-driven
//   queue:job:{id}:*      → set by workers, TTL = JOB_STATUS_TTL

export const CacheKeys = {
  // ── Resume ─────────────────────────────────────────────────────────────────
  resumeMeta: (id: string) => `resume:${id}:meta`,
  resumeParsed: (id: string) => `resume:${id}:parsed`,
  resumeChunksMeta: (id: string) => `resume:${id}:chunks:meta`,
  resumeAll: (userId: string) => `user:${userId}:resumes:list`,

  // ── Job Description ────────────────────────────────────────────────────────
  jobMeta: (id: string) => `job:${id}:meta`,
  jobAll: (userId: string) => `user:${userId}:jobs:list`,

  // ── ATS Analysis ──────────────────────────────────────────────────────────
  // Latest analysis for a resume+job pair (30 min TTL)
  analysisLatest: (resumeId: string, jobId: string) => `analysis:${resumeId}:${jobId}:latest`,
  analysisHistory: (userId: string) => `user:${userId}:analysis:history`,

  // ── AI Responses (mirrors DB cache in Phase 5 — Redis adds speed) ─────────
  aiResponse: (cacheKey: string) => `ai:${cacheKey}`,

  // ── Job Queue Status ──────────────────────────────────────────────────────
  jobStatus: (jobId: string) => `queue:job:${jobId}:status`,
  jobResult: (jobId: string) => `queue:job:${jobId}:result`,

  // ── Rate Limiting ─────────────────────────────────────────────────────────
  rateLimit: (type: string, identifier: string) => `rl:${type}:${identifier}`,

  // ── ATS Analysis (Phase 7) ────────────────────────────────────────────────
  // Key includes parsedUpdatedAt (ms) so cache auto-invalidates on re-upload
  // without needing an explicit invalidation call.
  // jdHash = first 12 chars of SHA-256(jdText) or 'nojd'.
  atsAnalysis: (resumeId: string, parsedUpdatedAt: number, jdHash: string) =>
    `ats-analysis:${resumeId}:${parsedUpdatedAt}:${jdHash}`,
  atsAnalysisPattern: (resumeId: string) => `ats-analysis:${resumeId}:*`,

  // ── Resume Comparison (Phase 7) ───────────────────────────────────────────
  resumeComparison: (
    resumeAId: string, aUpdatedAt: number,
    resumeBId: string, bUpdatedAt: number,
    jdHash: string,
  ) => `resume-compare:${resumeAId}:${aUpdatedAt}:${resumeBId}:${bUpdatedAt}:${jdHash}`,

  // ── Invalidation helpers (glob patterns) ─────────────────────────────────
  resumeAllKeys: (id: string) => `resume:${id}:*`,
  jobAllKeys: (id: string) => `job:${id}:*`,
  userAllKeys: (userId: string) => `user:${userId}:*`,
} as const;
