import { z } from 'zod';

const resumeJobBase = z.object({
  resumeId: z.string().uuid('resumeId must be a valid UUID'),
  jobId: z.string().uuid('jobId must be a valid UUID'),
  forceRefresh: z.boolean().optional().default(false),
});

// ─── POST /analysis/improve-resume ───────────────────────────────────────────

export const improveResumeSchema = z.object({
  body: resumeJobBase,
});

// ─── POST /analysis/roadmap ───────────────────────────────────────────────────

export const roadmapSchema = z.object({
  body: resumeJobBase.extend({
    weeklyHoursAvailable: z.number().min(1).max(80).optional().default(10),
  }),
});

// ─── POST /analysis/interview-prep ───────────────────────────────────────────

export const interviewPrepSchema = z.object({
  body: resumeJobBase.extend({
    focusAreas: z
      .array(z.enum(['technical', 'behavioral', 'project']))
      .optional()
      .default([]),
  }),
});

// ─── POST /analysis/rewrite-bullets ──────────────────────────────────────────

export const rewriteBulletsSchema = z.object({
  body: z.object({
    bullets: z
      .array(
        z.string()
          .min(5, 'Bullet must be at least 5 characters')
          .max(500, 'Bullet must be under 500 characters'),
      )
      .min(1, 'Provide at least one bullet')
      .max(20, 'Maximum 20 bullets per request'),
    jobId: z.string().uuid().optional(),
    targetRole: z.string().max(100).optional(),
    forceRefresh: z.boolean().optional().default(false),
  }),
});

// ─── POST /analysis/career-coach ─────────────────────────────────────────────

export const careerCoachSchema = z.object({
  body: resumeJobBase,
});

// ─── POST /analysis/learning-plan ────────────────────────────────────────────

export const learningPlanSchema = z.object({
  body: resumeJobBase.extend({
    weeklyHoursAvailable: z.number().min(1).max(80).optional().default(10),
  }),
});

// ─── GET /analysis/ai-metrics ────────────────────────────────────────────────

export const aiMetricsQuerySchema = z.object({
  query: z.object({
    days: z
      .string()
      .optional()
      .transform((v) => (v ? Math.min(90, parseInt(v, 10)) : 7))
      .refine((n) => n >= 1, 'days must be at least 1'),
  }),
});
