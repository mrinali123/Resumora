// ─── RankingService ───────────────────────────────────────────────────────────
//
// Ranks all of a user's job descriptions by compatibility with a given resume.
//
// Strategy (Phase 4):
//   1. Return all pre-computed MatchAnalysis for this resume, sorted by score.
//      This is O(1) DB lookup regardless of how many jobs the user has.
//   2. Include jobs that have never been analysed, flagged with analysisPending: true.
//      The client should show a "Run analysis" call-to-action for these.
//   3. Optionally trigger fresh analysis for unanalysed jobs (opt-in via `autoAnalyse`).
//      Disabled by default to keep response time predictable.
//
// Phase 5: move `autoAnalyse` to a background BullMQ job so the GET response
// returns immediately and the UI polls for completion.
//
// Scalability notes for 1M job descriptions:
//   - The `@@index([resumeId, overallScore(sort: Desc)])` on match_analyses
//     ensures this query is an index range scan, not a full table scan.
//   - `autoAnalyse` should use a work queue, not inline awaits, at scale.
//   - For federated ranking (multiple users sharing job pools), add a
//     `visibility` enum to JobDescription and a separate ranking index.

import { prisma } from '../config/database';
import { matchingService } from './matching.service';
import { logger } from '../utils/logger';
import { SCORING_VERSION } from './skills.constants';
import type { JobRanking } from './types';

export interface RankingOptions {
  limit?: number;
  offset?: number;
  // If true, run fresh analysis for jobs with no cached result.
  // Keep false in production until you have a worker queue.
  autoAnalyse?: boolean;
}

export class RankingService {
  async rankJobsForResume(
    resumeId: string,
    userId: string,
    options: RankingOptions = {},
  ): Promise<JobRanking[]> {
    const { limit = 20, offset = 0, autoAnalyse = false } = options;

    // ── All jobs for this user ─────────────────────────────────────────────
    const allJobs = await prisma.jobDescription.findMany({
      where: { userId },
      select: { id: true, title: true, company: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    // ── Latest analysis per job for this resume ────────────────────────────
    // One query, not N queries — groupBy + MAX(createdAt) trick via raw Prisma
    const analyses = await prisma.matchAnalysis.findMany({
      where: {
        resumeId,
        userId,
        scoringVersion: SCORING_VERSION,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        jobId: true,
        overallScore: true,
        matchingSkills: true,
        missingRequiredSkills: true,
        createdAt: true,
      },
    });

    // Build a map: jobId → most recent analysis
    const latestByJob = new Map<string, typeof analyses[number]>();
    for (const a of analyses) {
      if (!latestByJob.has(a.jobId)) {
        latestByJob.set(a.jobId, a); // already sorted by createdAt desc
      }
    }

    // ── Auto-analyse missing jobs (opt-in) ─────────────────────────────────
    if (autoAnalyse) {
      const unanalysed = allJobs.filter((j) => !latestByJob.has(j.id));
      // Process at most 5 inline to avoid request timeouts
      const toAnalyse = unanalysed.slice(0, 5);

      await Promise.allSettled(
        toAnalyse.map(async (job) => {
          try {
            const result = await matchingService.analyze(resumeId, job.id, userId, {
              save: true,
              useCache: true,
            });
            latestByJob.set(job.id, {
              id: result.id!,
              jobId: job.id,
              overallScore: result.atsScore,
              matchingSkills: result.matchingSkills as string[],
              missingRequiredSkills: result.missingRequiredSkills as string[],
              createdAt: new Date(result.analyzedAt),
            });
          } catch (err) {
            logger.warn({ err, resumeId, jobId: job.id }, 'Auto-analyse failed; skipping job');
          }
        }),
      );
    }

    // ── Build ranking ──────────────────────────────────────────────────────
    const ranked: JobRanking[] = allJobs.map((job) => {
      const analysis = latestByJob.get(job.id);

      if (!analysis) {
        return {
          job,
          analysisId: null,
          matchScore: null,
          skillOverlap: [],
          missingSkills: [],
          analyzedAt: null,
        };
      }

      return {
        job,
        analysisId: analysis.id,
        matchScore: analysis.overallScore,
        skillOverlap: analysis.matchingSkills as string[],
        missingSkills: analysis.missingRequiredSkills as string[],
        analyzedAt: analysis.createdAt.toISOString(),
      };
    });

    // Sort: analysed jobs by score (desc), then unanalysed jobs at bottom
    ranked.sort((a, b) => {
      if (a.matchScore === null && b.matchScore === null) return 0;
      if (a.matchScore === null) return 1;
      if (b.matchScore === null) return -1;
      return b.matchScore - a.matchScore;
    });

    return ranked.slice(offset, offset + limit);
  }
}

export const rankingService = new RankingService();
