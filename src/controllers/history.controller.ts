import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { historyService } from '../services/history.service';

// ── GET /api/v1/history ───────────────────────────────────────────────────────
// Returns the authenticated user's uploaded resumes (newest first), each
// enriched with its latest ATS score and latest job-fit score.
//
// Previous bug: `data` held the items array directly while `total` was buried
// in `meta`, so `body.data.items` and `body.data.total` were both undefined on
// the client. Fixed by placing both inside `data: { items, total }`.
//
// Query params:
//   limit  (default 50, max 100)
//   offset (default 0)

export const getHistory = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const limit  = Math.min(Number(req.query['limit']  ?? 50), 100);
  const offset = Number(req.query['offset'] ?? 0);

  const result = await historyService.getHistory(userId, limit, offset);

  res.status(200).json({
    success: true,
    // Both items and total are inside `data` so `request<HistoryResponse>()` on
    // the client can access them as `result.items` and `result.total`.
    data: {
      items: result.items,
      total: result.total,
    },
    meta: { limit, offset },
  });
});
