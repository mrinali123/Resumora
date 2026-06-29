import type { Request, Response } from 'express';
import { retrievalService } from '../retrieval/retrieval.service';
import { asyncHandler } from '../utils/async-handler';
import type { SearchQueryInput } from '../validators/search.validator';

// ─── POST /api/v1/search ──────────────────────────────────────────────────────
//
// Converts the user's natural-language query into a vector embedding, then runs
// a pgvector cosine-similarity search across all chunks belonging to the
// authenticated user's resumes and/or job descriptions.
//
// Response shape (success):
// {
//   success: true,
//   data: SearchResult[],        // sorted by similarity desc
//   meta: { query, total, limit, offset }
// }

export const semanticSearch = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as SearchQueryInput;
  const userId = req.user!.userId;

  const results = await retrievalService.search(
    {
      query: body.query,
      filters: body.filters,
      limit: body.limit,
      offset: body.offset,
      minSimilarity: body.minSimilarity,
    },
    userId,
  );

  res.json({
    success: true,
    data: results,
    meta: {
      query: body.query,
      total: results.length,
      limit: body.limit,
      offset: body.offset,
    },
  });
});
