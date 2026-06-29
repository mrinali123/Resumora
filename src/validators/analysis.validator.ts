import { z } from 'zod';

// ─── POST /analysis/job-fit ───────────────────────────────────────────────────

export const jobFitSchema = z.object({
  body: z.object({
    resumeId: z.string().uuid('resumeId must be a valid UUID'),
    jobId: z.string().uuid('jobId must be a valid UUID'),
    // Re-run analysis even if a fresh cached result exists
    forceRefresh: z.boolean().optional().default(false),
    // Whether to save the result to history (default: true)
    save: z.boolean().optional().default(true),
    // Custom scoring weights (must sum to 1.0; validated in MatchingService)
    weights: z
      .object({
        skills: z.number().min(0).max(1),
        experience: z.number().min(0).max(1),
        education: z.number().min(0).max(1),
        keyword: z.number().min(0).max(1),
        semantic: z.number().min(0).max(1),
      })
      .optional(),
  }),
});

export type JobFitInput = z.infer<typeof jobFitSchema>['body'];

// ─── GET /analysis/history ────────────────────────────────────────────────────

export const historyQuerySchema = z.object({
  query: z.object({
    resumeId: z.string().uuid().optional(),
    jobId: z.string().uuid().optional(),
    limit: z
      .string()
      .optional()
      .transform((v) => (v ? Math.min(50, parseInt(v, 10)) : 10))
      .refine((n) => n >= 1, 'limit must be at least 1'),
    offset: z
      .string()
      .optional()
      .transform((v) => (v ? parseInt(v, 10) : 0))
      .refine((n) => n >= 0, 'offset must be non-negative'),
  }),
});

export type HistoryQueryInput = z.infer<typeof historyQuerySchema>['query'];

// ─── GET /analysis/:id ────────────────────────────────────────────────────────

export const analysisParamsSchema = z.object({
  params: z.object({
    id: z.string().uuid('Analysis ID must be a valid UUID'),
  }),
});

// ─── GET /jobs/best-match ─────────────────────────────────────────────────────

export const bestMatchQuerySchema = z.object({
  query: z.object({
    resumeId: z.string().uuid('resumeId must be a valid UUID'),
    limit: z
      .string()
      .optional()
      .transform((v) => (v ? Math.min(50, parseInt(v, 10)) : 20))
      .refine((n) => n >= 1, 'limit must be at least 1'),
    offset: z
      .string()
      .optional()
      .transform((v) => (v ? parseInt(v, 10) : 0)),
    autoAnalyse: z
      .string()
      .optional()
      .transform((v) => v === 'true'),
  }),
});

export type BestMatchQueryInput = z.infer<typeof bestMatchQuerySchema>['query'];
