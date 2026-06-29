import { Router } from 'express';
import { protect } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { aiRateLimit } from '../middleware/rate-limit.middleware';

// ─── Phase 4: ATS Analysis ────────────────────────────────────────────────────
import {
  jobFitSchema,
  historyQuerySchema,
  analysisParamsSchema,
} from '../validators/analysis.validator';
import {
  runJobFitAnalysis,
  getAnalysisHistory,
  getAnalysis,
} from '../controllers/analysis.controller';

// ─── Phase 5: AI Intelligence ────────────────────────────────────────────────
import {
  improveResumeSchema,
  roadmapSchema,
  interviewPrepSchema,
  rewriteBulletsSchema,
  careerCoachSchema,
  learningPlanSchema,
  aiMetricsQuerySchema,
} from '../validators/ai-analysis.validator';
import {
  improveResume,
  generateRoadmap,
  generateInterviewPrep,
  rewriteBullets,
  runCareerCoach,
  generateLearningPlan,
  getAIMetrics,
} from '../controllers/ai-analysis.controller';

const router = Router();

router.use(protect);

// ─── Phase 4 routes ───────────────────────────────────────────────────────────

// POST /api/v1/analysis/job-fit
router.post('/job-fit', validate(jobFitSchema), runJobFitAnalysis);

// GET /api/v1/analysis/history
router.get('/history', validate(historyQuerySchema), getAnalysisHistory);

// ─── Phase 5 routes ───────────────────────────────────────────────────────────
// Ordered before /:id to prevent literal strings matching the UUID param

// POST /api/v1/analysis/improve-resume
router.post('/improve-resume', aiRateLimit, validate(improveResumeSchema), improveResume);

// POST /api/v1/analysis/roadmap
router.post('/roadmap', aiRateLimit, validate(roadmapSchema), generateRoadmap);

// POST /api/v1/analysis/interview-prep
router.post('/interview-prep', aiRateLimit, validate(interviewPrepSchema), generateInterviewPrep);

// POST /api/v1/analysis/rewrite-bullets
router.post('/rewrite-bullets', aiRateLimit, validate(rewriteBulletsSchema), rewriteBullets);

// POST /api/v1/analysis/career-coach
router.post('/career-coach', aiRateLimit, validate(careerCoachSchema), runCareerCoach);

// POST /api/v1/analysis/learning-plan
router.post('/learning-plan', aiRateLimit, validate(learningPlanSchema), generateLearningPlan);

// GET /api/v1/analysis/ai-metrics
router.get('/ai-metrics', validate(aiMetricsQuerySchema), getAIMetrics);

// ─── Phase 4: parameterised routes (MUST be last) ────────────────────────────

// GET /api/v1/analysis/:id
router.get('/:id', validate(analysisParamsSchema), getAnalysis);

export default router;
