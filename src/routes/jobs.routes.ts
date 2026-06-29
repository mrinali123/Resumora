import { Router } from 'express';
import { getJobStatus, getJobResult } from '../controllers/jobs.controller';
import { protect } from '../middleware/auth.middleware';

const router = Router();

router.use(protect);

// GET /api/v1/queue-jobs/:id/status  — poll job progress
router.get('/:id/status', getJobStatus);

// GET /api/v1/queue-jobs/:id/result  — fetch completed result
router.get('/:id/result', getJobResult);

export default router;
