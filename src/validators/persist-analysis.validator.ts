import { z } from 'zod';

// ── POST /resumes/:id/analyze ────────────────────────────────────────────────

export const analyzeResumeBodySchema = z.object({
  body: z.object({
    jobDescription: z.string().max(20_000).optional(),
  }),
  params: z.object({
    id: z.string().uuid('Resume ID must be a valid UUID'),
  }),
});

export type AnalyzeResumeInput = z.infer<typeof analyzeResumeBodySchema>;

// ── POST /compare-resumes ────────────────────────────────────────────────────

export const compareResumesSchema = z.object({
  body: z.object({
    resumeAId:     z.string().uuid('resumeAId must be a valid UUID'),
    resumeBId:     z.string().uuid('resumeBId must be a valid UUID'),
    jobDescription: z.string().max(20_000).optional(),
  }),
});

export type CompareResumesInput = z.infer<typeof compareResumesSchema>;

// ── GET /history ─────────────────────────────────────────────────────────────

export const historyQuerySchema = z.object({
  query: z.object({
    limit:  z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  }),
});

export type HistoryQueryInput = z.infer<typeof historyQuerySchema>;

// ── GET /analyses/:id  &  GET /comparisons/:id ──────────────────────────────

export const idParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('ID must be a valid UUID'),
  }),
});

export type IdParamInput = z.infer<typeof idParamSchema>;
