import { Router } from 'express';
import { shallowHealth, deepHealth, getMetrics } from '../controllers/health.controller';

const router = Router();

// GET /health           — liveness probe (always 200)
router.get('/', shallowHealth);

// GET /health/deep      — readiness probe (503 if DB down)
router.get('/deep', deepHealth);

// GET /health/metrics   — in-process metrics snapshot
router.get('/metrics', getMetrics);

export default router;
