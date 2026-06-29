import { Router } from 'express';
import { protect } from '../middleware/auth.middleware';
import { getHistory } from '../controllers/history.controller';

const router = Router();

router.use(protect);

// GET /api/v1/history — unified activity feed for the authenticated user.
// Supports ?limit=50&offset=0 pagination.
router.get('/', getHistory);

export default router;
