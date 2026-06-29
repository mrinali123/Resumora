import { Router, Request, Response, NextFunction } from 'express';
import {
  createResume,
  uploadResume,
  getResumes,
  getResume,
  getResumeDetails,
  deleteResume,
  getSimilarResumes,
  parseResumeEndpoint,
} from '../controllers/resume.controller';
import { getResumeStrength } from '../controllers/analysis.controller';
import {
  analyzeResume,
  listResumeAnalyses,
} from '../controllers/ats-analysis.controller';
import { validate } from '../middleware/validate.middleware';
import {
  createResumeSchema,
  uploadResumeBodySchema,
  resumeParamsSchema,
} from '../validators/resume.validator';
import { analyzeResumeBodySchema } from '../validators/persist-analysis.validator';
import { protect } from '../middleware/auth.middleware';
import { analyzeRateLimit } from '../middleware/rate-limit.middleware';
import { uploadResumeFile } from '../config/upload';

const router = Router();

// All resume routes require a valid JWT
router.use(protect);

// ── Phase 1: metadata-only create ────────────────────────────────────────────
router.post('/', validate(createResumeSchema), createResume);

// ── Parser v3: stateless structured extraction ────────────────────────────────
// POST /resumes/parse — no DB write, returns JSON immediately.
// Accepts file (multipart) or raw text (JSON body).
router.post(
  '/parse',
  (req: Request, res: Response, next: NextFunction) => {
    // Multer stores file in memory for the parse endpoint (no disk write needed)
    const multer = require('multer') as typeof import('multer');
    multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }).single('file')(req, res, (err) => {
      if (err) return next(err);
      next();
    });
  },
  parseResumeEndpoint,
);

// ── Phase 2: file upload + extraction pipeline ────────────────────────────────
// Route order matters: /upload must be declared before /:id so Express doesn't
// try to treat the literal string "upload" as a UUID param.
//
// Middleware chain:
//   1. uploadResumeFile  — multer: saves file to disk, validates size + MIME
//   2. validate(...)     — Zod: validates optional title text field
//   3. uploadResume      — controller: runs extraction + parse pipeline
router.post(
  '/upload',
  (req: Request, res: Response, next: NextFunction) => {
    // Wrap multer in a callback so its errors reach the global error handler
    // rather than being swallowed by Express's default error handling.
    uploadResumeFile(req, res, (err) => {
      if (err) return next(err);
      next();
    });
  },
  validate(uploadResumeBodySchema),
  uploadResume,
);

// ── Read ─────────────────────────────────────────────────────────────────────
router.get('/', getResumes);
router.get('/:id', validate(resumeParamsSchema), getResume);

// Details endpoint: metadata + extracted text + all parsed fields.
// Kept separate from GET /:id to avoid loading large text/JSON on every read.
router.get('/:id/details', validate(resumeParamsSchema), getResumeDetails);

// ── Phase 3: semantic similarity ──────────────────────────────────────────────
router.get('/:id/similar', validate(resumeParamsSchema), getSimilarResumes);

// ── Phase 4: intrinsic resume strength ────────────────────────────────────────
// Returns strongest skills/experience/projects without requiring a specific job.
router.get('/:id/strength', validate(resumeParamsSchema), getResumeStrength);

// ── ATS analysis + recruiter simulation ──────────────────────────────────────
// POST /resumes/:id/analyze — runs explain_score() + simulate_recruiter() and
// stores the result. Optional { jobDescription } in the request body.
router.post('/:id/analyze', analyzeRateLimit, validate(analyzeResumeBodySchema), analyzeResume);

// GET /resumes/:id/analyses — list all analyses for a resume.
router.get('/:id/analyses', validate(resumeParamsSchema), listResumeAnalyses);

// ── Delete ────────────────────────────────────────────────────────────────────
router.delete('/:id', validate(resumeParamsSchema), deleteResume);

export default router;
