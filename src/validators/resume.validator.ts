import { z } from 'zod';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

// ── Phase 1: metadata-only creation ──────────────────────────────────────────
export const createResumeSchema = z.object({
  body: z.object({
    title: z.string().min(1, 'Title is required').max(200).trim(),
    originalFileName: z.string().min(1, 'Original file name is required'),
    storagePath: z.string().min(1, 'Storage path is required'),
    fileSize: z.number().int().positive().optional(),
    mimeType: z.enum(ALLOWED_MIME_TYPES).optional(),
  }),
});

// ── Phase 2: multipart upload — optional title from form data ─────────────────
// Multer handles the file field; Zod validates the optional text fields.
export const uploadResumeBodySchema = z.object({
  body: z.object({
    title: z.string().min(1).max(200).trim().optional(),
  }),
});

// ── Shared param validation ───────────────────────────────────────────────────
export const resumeParamsSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid resume ID format'),
  }),
});

export type CreateResumeInput = z.infer<typeof createResumeSchema>['body'];
export type UploadResumeBody = z.infer<typeof uploadResumeBodySchema>['body'];
