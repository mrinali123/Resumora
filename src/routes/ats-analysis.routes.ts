import { Router } from 'express';
import { protect } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { compareRateLimit } from '../middleware/rate-limit.middleware';
import {
  analyzeResume,
  getAnalysis,
  listResumeAnalyses,
} from '../controllers/ats-analysis.controller';
import {
  compareResumes,
  getComparison,
  listComparisons,
} from '../controllers/resume-comparison.controller';
import {
  analyzeResumeBodySchema,
  compareResumesSchema,
  idParamSchema,
} from '../validators/persist-analysis.validator';

const router = Router();

// All routes require a valid JWT
router.use(protect);

// ── ATS analysis ──────────────────────────────────────────────────────────────
// POST /analyze-resume?resumeId=... is handled via POST /resumes/:id/analyze
// (see resume.routes.ts which mounts analyzeResume at /:id/analyze)
//
// These routes expose analysis retrieval at a top-level /analyses path so
// callers don't need to know which resume an analysis belongs to.

router.get('/analyses/:id', validate(idParamSchema), getAnalysis);

// ── Resume comparison ─────────────────────────────────────────────────────────

// POST /api/v1/compare-resumes
router.post('/compare-resumes', compareRateLimit, validate(compareResumesSchema), compareResumes);

// GET /api/v1/comparisons
router.get('/comparisons', listComparisons);

// GET /api/v1/comparisons/:id
router.get('/comparisons/:id', validate(idParamSchema), getComparison);

export default router;
