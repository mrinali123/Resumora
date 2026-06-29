import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { NotFoundError } from '../utils/errors';
import { matchingService } from '../analysis/matching.service';
import { rankingService } from '../analysis/ranking.service';
import { strengthService } from '../analysis/strength.service';
import { prisma } from '../config/database';
import type { JobFitInput, HistoryQueryInput, BestMatchQueryInput } from '../validators/analysis.validator';

// ─── POST /api/v1/analysis/job-fit ───────────────────────────────────────────

export const runJobFitAnalysis = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as JobFitInput;
  const userId = req.user!.userId;

  const result = await matchingService.analyze(
    body.resumeId,
    body.jobId,
    userId,
    {
      save: body.save,
      useCache: !body.forceRefresh,
      weights: body.weights,
    },
  );

  res.status(200).json({ success: true, data: result });
});

// ─── GET /api/v1/analysis/history ────────────────────────────────────────────

export const getAnalysisHistory = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as unknown as HistoryQueryInput;
  const userId = req.user!.userId;

  const where = {
    userId,
    ...(q.resumeId ? { resumeId: q.resumeId } : {}),
    ...(q.jobId ? { jobId: q.jobId } : {}),
  };

  const [analyses, total] = await Promise.all([
    prisma.matchAnalysis.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: q.offset,
      take: q.limit,
      select: {
        id: true,
        resumeId: true,
        jobId: true,
        overallScore: true,
        skillScore: true,
        experienceScore: true,
        educationScore: true,
        matchingSkills: true,
        missingRequiredSkills: true,
        embeddingsUsed: true,
        scoringVersion: true,
        createdAt: true,
        resume: { select: { id: true, title: true } },
        job: { select: { id: true, title: true, company: true } },
      },
    }),
    prisma.matchAnalysis.count({ where }),
  ]);

  res.json({
    success: true,
    data: analyses,
    pagination: {
      total,
      limit: q.limit,
      offset: q.offset,
      hasMore: q.offset + q.limit < total,
    },
  });
});

// ─── GET /api/v1/analysis/:id ─────────────────────────────────────────────────

export const getAnalysis = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.userId;

  const analysis = await prisma.matchAnalysis.findFirst({
    where: { id, userId },
    include: {
      resume: { select: { id: true, title: true } },
      job: { select: { id: true, title: true, company: true } },
    },
  });

  if (!analysis) throw new NotFoundError('Analysis');

  res.json({ success: true, data: analysis });
});

// ─── GET /api/v1/resumes/:id/strength ────────────────────────────────────────

export const getResumeStrength = asyncHandler(async (req: Request, res: Response) => {
  const { id: resumeId } = req.params;
  const userId = req.user!.userId;

  const resume = await prisma.resume.findFirst({
    where: { id: resumeId, userId },
    select: { status: true },
  });
  if (!resume) throw new NotFoundError('Resume');

  const strength = await strengthService.computeResumeStrength(resumeId);

  res.json({ success: true, data: strength });
});

// ─── GET /api/v1/jobs/best-match ─────────────────────────────────────────────

export const getBestMatchJobs = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as unknown as BestMatchQueryInput;
  const userId = req.user!.userId;

  const ranked = await rankingService.rankJobsForResume(q.resumeId, userId, {
    limit: q.limit,
    offset: q.offset,
    autoAnalyse: q.autoAnalyse,
  });

  res.json({
    success: true,
    count: ranked.length,
    data: ranked,
  });
});
