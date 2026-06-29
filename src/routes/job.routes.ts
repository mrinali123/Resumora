import { Router } from 'express';
import { createJob, getJobs, getJob, deleteJob } from '../controllers/job.controller';
import { validate } from '../middleware/validate.middleware';
import { createJobSchema, jobParamsSchema } from '../validators/job.validator';
import { bestMatchQuerySchema } from '../validators/analysis.validator';
import { getBestMatchJobs } from '../controllers/analysis.controller';
import { protect } from '../middleware/auth.middleware';

const router = Router();

// All job description routes require a valid JWT
router.use(protect);

// Phase 4: ranking — must be before /:id to avoid 'best-match' being treated as a UUID
router.get('/best-match', validate(bestMatchQuerySchema), getBestMatchJobs);

router.post('/', validate(createJobSchema), createJob);
router.get('/', getJobs);
router.get('/:id', validate(jobParamsSchema), getJob);
router.delete('/:id', validate(jobParamsSchema), deleteJob);

export default router;
