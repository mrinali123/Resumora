import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { resumeComparisonService } from '../services/resume-comparison.service';
import type {
  CompareResumesInput,
  IdParamInput,
} from '../validators/persist-analysis.validator';

// ── POST /api/v1/compare-resumes ─────────────────────────────────────────────
// Compares two stored resumes and persists the comparison result.

export const compareResumes = asyncHandler(async (req: Request, res: Response) => {
  const body   = req.body as CompareResumesInput['body'];
  const userId = req.user!.userId;

  const result = await resumeComparisonService.compare(
    userId,
    body.resumeAId,
    body.resumeBId,
    body.jobDescription,
  );

  res.status(201).json({ success: true, data: result });
});

// ── GET /api/v1/comparisons/:id ───────────────────────────────────────────────

export const getComparison = asyncHandler(async (req: Request, res: Response) => {
  const { id } = (req as Request & { params: IdParamInput['params'] }).params;
  const userId = req.user!.userId;

  const result = await resumeComparisonService.findOne(id, userId);

  res.status(200).json({ success: true, data: result });
});

// ── GET /api/v1/comparisons ───────────────────────────────────────────────────

export const listComparisons = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const limit  = Number(req.query['limit']  ?? 50);
  const offset = Number(req.query['offset'] ?? 0);

  const result = await resumeComparisonService.findAllByUser(userId, limit, offset);

  res.status(200).json({ success: true, data: result });
});
