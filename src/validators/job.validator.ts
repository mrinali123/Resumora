import { z } from 'zod';

export const createJobSchema = z.object({
  body: z.object({
    title: z.string().min(1, 'Job title is required').max(200).trim(),
    company: z.string().max(200).trim().optional(),
    content: z
      .string()
      .min(10, 'Job description must be at least 10 characters')
      .trim(),
  }),
});

export const jobParamsSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid job description ID format'),
  }),
});

export type CreateJobInput = z.infer<typeof createJobSchema>['body'];
