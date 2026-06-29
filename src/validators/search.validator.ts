import { z } from 'zod';
import { CHUNK_TYPES } from '../chunkers/types';

// ─── POST /search ─────────────────────────────────────────────────────────────

export const searchQuerySchema = z.object({
  body: z.object({
    query: z
      .string({ required_error: 'query is required' })
      .min(1, 'query cannot be empty')
      .max(500, 'query must be 500 characters or fewer'),
    filters: z
      .object({
        chunkTypes: z
          .array(z.enum(CHUNK_TYPES))
          .optional()
          .describe('Restrict results to these chunk types'),
        sourceType: z
          .enum(['resume', 'job', 'all'])
          .optional()
          .default('all'),
      })
      .optional(),
    limit: z.number().int().min(1).max(50).optional().default(10),
    offset: z.number().int().min(0).optional().default(0),
    minSimilarity: z.number().min(0).max(1).optional(),
  }),
});

export type SearchQueryInput = z.infer<typeof searchQuerySchema>['body'];

// ─── GET /resumes/:id/similar ─────────────────────────────────────────────────

export const similarResumesQuerySchema = z.object({
  params: z.object({
    id: z.string().uuid('Resume ID must be a valid UUID'),
  }),
  query: z.object({
    limit: z
      .string()
      .optional()
      .transform((v) => (v ? parseInt(v, 10) : 5))
      .refine((n) => n >= 1 && n <= 20, 'limit must be between 1 and 20'),
  }),
});

export type SimilarResumesInput = z.infer<typeof similarResumesQuerySchema>;
