import { Router } from 'express';
import { protect } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { searchQuerySchema } from '../validators/search.validator';
import { semanticSearch } from '../controllers/search.controller';

const router = Router();

router.use(protect);

// POST /api/v1/search
// Body: { query, filters?, limit?, offset?, minSimilarity? }
// Returns ranked chunks from the authenticated user's resumes and job descriptions.
router.post('/', validate(searchQuerySchema), semanticSearch);

export default router;
