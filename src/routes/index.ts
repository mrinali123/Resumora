import { Router } from 'express';
import authRoutes from './auth.routes';
import resumeRoutes from './resume.routes';
import jobRoutes from './job.routes';
import searchRoutes from './search.routes';
import analysisRoutes from './analysis.routes';
import jobsStatusRoutes from './jobs.routes';
import atsAnalysisRoutes from './ats-analysis.routes';
import historyRoutes from './history.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/resumes', resumeRoutes);
router.use('/jobs', jobRoutes);
router.use('/search', searchRoutes);
router.use('/analysis', analysisRoutes);
// Async job status polling (separate from /jobs which is job descriptions)
router.use('/queue-jobs', jobsStatusRoutes);
// Persist-and-retrieve: ATS analyses, comparisons (top-level paths)
router.use('/', atsAnalysisRoutes);
// Unified activity history feed
router.use('/history', historyRoutes);

export default router;
