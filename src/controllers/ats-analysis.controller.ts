import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { atsAnalysisService } from '../services/ats-analysis.service';
import type {
  AnalyzeResumeInput,
  IdParamInput,
} from '../validators/persist-analysis.validator';

// ── POST /api/v1/resumes/:id/analyze ─────────────────────────────────────────
// Runs explain_score() + simulate_recruiter() against a stored parsed resume.
//
// Sync path (default): runs engines inline, returns 201 with full result.
// Async path (?async=true): enqueues a BullMQ job, returns 202 with jobId.
//   Poll:   GET /api/v1/queue-jobs/:jobId/status
//   Result: GET /api/v1/queue-jobs/:jobId/result  (or GET /analyses/:id)

export const analyzeResume = asyncHandler(async (req: Request, res: Response) => {
  const { id: resumeId } = (req as Request & { params: AnalyzeResumeInput['params'] }).params;
  const body            = req.body as AnalyzeResumeInput['body'];
  const userId          = req.user!.userId;
  const isAsync         = req.query['async'] === 'true';

  if (isAsync) {
    const { jobId } = await atsAnalysisService.enqueueAnalyze(
      userId,
      resumeId,
      body.jobDescription,
    );
    return res.status(202).json({
      success: true,
      data: {
        jobId,
        status:  'queued',
        pollUrl: `/api/v1/queue-jobs/${jobId}/status`,
      },
    });
  }

  const result = await atsAnalysisService.analyze(userId, resumeId, body.jobDescription);
  res.status(201).json({ success: true, data: result });
});

// ── GET /api/v1/analyses/:id ──────────────────────────────────────────────────

export const getAnalysis = asyncHandler(async (req: Request, res: Response) => {
  const { id } = (req as Request & { params: IdParamInput['params'] }).params;
  const userId = req.user!.userId;

  const result = await atsAnalysisService.findOne(id, userId);

  res.status(200).json({ success: true, data: result });
});

// ── GET /api/v1/resumes/:id/analyses ─────────────────────────────────────────
// List all analyses for a specific resume.

export const listResumeAnalyses = asyncHandler(async (req: Request, res: Response) => {
  const { id: resumeId } = (req as Request & { params: IdParamInput['params'] }).params;
  const userId           = req.user!.userId;
  const limit            = Number(req.query['limit'] ?? 20);

  const rows = await atsAnalysisService.findAllByResume(resumeId, userId, limit);

  res.status(200).json({ success: true, data: rows });
});
