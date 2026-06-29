import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { improveResumeService } from '../analysis/improve-resume.service';
import { roadmapService } from '../analysis/roadmap.service';
import { interviewPrepService } from '../analysis/interview-prep.service';
import { rewriteBulletsService } from '../analysis/rewrite-bullets.service';
import { careerCoachService } from '../analysis/career-coach.service';
import { learningPlanService } from '../analysis/learning-plan.service';
import { aiMetricsService } from '../ai/metrics/ai-metrics.service';

// ─── POST /api/v1/analysis/improve-resume ─────────────────────────────────────

export const improveResume = asyncHandler(async (req: Request, res: Response) => {
  const { resumeId, jobId, forceRefresh } = req.body;
  const result = await improveResumeService.run(resumeId, jobId, req.user!.userId, forceRefresh);
  res.json({ success: true, data: result });
});

// ─── POST /api/v1/analysis/roadmap ────────────────────────────────────────────

export const generateRoadmap = asyncHandler(async (req: Request, res: Response) => {
  const { resumeId, jobId, forceRefresh, weeklyHoursAvailable } = req.body;
  const result = await roadmapService.run(resumeId, jobId, req.user!.userId, weeklyHoursAvailable, forceRefresh);
  res.json({ success: true, data: result });
});

// ─── POST /api/v1/analysis/interview-prep ─────────────────────────────────────

export const generateInterviewPrep = asyncHandler(async (req: Request, res: Response) => {
  const { resumeId, jobId, forceRefresh, focusAreas } = req.body;
  const result = await interviewPrepService.run(resumeId, jobId, req.user!.userId, focusAreas, forceRefresh);
  res.json({ success: true, data: result });
});

// ─── POST /api/v1/analysis/rewrite-bullets ────────────────────────────────────

export const rewriteBullets = asyncHandler(async (req: Request, res: Response) => {
  const { bullets, jobId, targetRole, forceRefresh } = req.body;
  const result = await rewriteBulletsService.run({
    userId: req.user!.userId,
    bullets,
    jobId,
    targetRole,
    forceRefresh,
  });
  res.json({ success: true, data: result });
});

// ─── POST /api/v1/analysis/career-coach ───────────────────────────────────────

export const runCareerCoach = asyncHandler(async (req: Request, res: Response) => {
  const { resumeId, jobId, forceRefresh } = req.body;
  const result = await careerCoachService.run(resumeId, jobId, req.user!.userId, forceRefresh);
  res.json({ success: true, data: result });
});

// ─── POST /api/v1/analysis/learning-plan ──────────────────────────────────────

export const generateLearningPlan = asyncHandler(async (req: Request, res: Response) => {
  const { resumeId, jobId, forceRefresh, weeklyHoursAvailable } = req.body;
  const result = await learningPlanService.run(resumeId, jobId, req.user!.userId, weeklyHoursAvailable, forceRefresh);
  res.json({ success: true, data: result });
});

// ─── GET /api/v1/analysis/ai-metrics ──────────────────────────────────────────

export const getAIMetrics = asyncHandler(async (req: Request, res: Response) => {
  const days = req.query['days'] ? parseInt(req.query['days'] as string, 10) : 7;
  const summary = await aiMetricsService.getSummary(req.user!.userId, days);
  res.json({ success: true, data: summary });
});
