// ─── MatchingService ──────────────────────────────────────────────────────────
//
// Orchestrates the full resume ↔ job analysis pipeline:
//
//   1. Ownership validation — resume and job both belong to the requesting user
//   2. Cache check — return stored analysis if < CACHE_TTL_HOURS old and fresh
//   3. Data loading — ParsedResume, ResumeContent, JobDescription, job chunks
//   4. Skill gap analysis — GapAnalysisService
//   5. ATS scoring — ScoringService (five components)
//   6. Strength identification — StrengthService
//   7. Persist to match_analyses — conditionally
//   8. Return AnalysisResult
//
// Phase 5 hook: after step 7, enqueue an LLM job with the AnalysisResult
// payload to generate explanations, recommendations, and interview questions.
//
// Scalability notes:
//   - Steps 4–6 involve embedding API calls (~1–3 s) and in-memory vector math.
//     Move these to a BullMQ worker (Phase 5) to keep HTTP response latency < 200 ms.
//   - Cache (step 2) avoids re-analysis when neither document has changed.
//     Invalidate on resume re-upload or job description update (add updatedAt comparison).
//   - For batch ranking (GET /jobs/best-match), the ranking service calls
//     this service per job only when no fresh cached analysis exists.

import { prisma } from '../config/database';
import { ForbiddenError, NotFoundError, AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { getEmbeddingService } from '../embeddings';
import { gapAnalysisService, extractJobSkills } from './gap-analysis.service';
import { scoringService } from './scoring.service';
import { strengthService } from './strength.service';
import {
  DEFAULT_SCORING_WEIGHTS,
  SCORING_VERSION,
  type ScoringWeights,
} from './skills.constants';
import { extractSkillsFromText } from './skills.utils';
import type { AnalysisResult } from './types';
import type { Education } from '../parsers/types';

// Analysis results are cached for this many hours.
// Invalidated if the resume or job was updated after the analysis was created.
const CACHE_TTL_HOURS = 24;

export interface AnalyzeOptions {
  save?: boolean;           // persist to match_analyses table (default: true)
  useCache?: boolean;       // return fresh analysis if < TTL old (default: true)
  weights?: ScoringWeights; // custom weights (default: DEFAULT_SCORING_WEIGHTS)
}

export class MatchingService {
  async analyze(
    resumeId: string,
    jobId: string,
    userId: string,
    options: AnalyzeOptions = {},
  ): Promise<AnalysisResult> {
    const { save = true, useCache = true, weights = DEFAULT_SCORING_WEIGHTS } = options;

    this.validateWeights(weights);

    // ── 1. Ownership validation ───────────────────────────────────────────────
    const [resume, job] = await Promise.all([
      prisma.resume.findUnique({
        where: { id: resumeId },
        include: {
          parsedData: true,
          content: { select: { extractedText: true } },
        },
      }),
      prisma.jobDescription.findUnique({
        where: { id: jobId },
        include: {
          chunks: { select: { chunkType: true, content: true } },
        },
      }),
    ]);

    if (!resume) throw new NotFoundError('Resume');
    if (resume.userId !== userId) throw new ForbiddenError();

    if (!job) throw new NotFoundError('Job description');
    if (job.userId !== userId) throw new ForbiddenError();

    if (resume.status !== 'PROCESSED') {
      throw new AppError(
        'Resume has not finished processing. Wait for status = PROCESSED before running analysis.',
        422,
      );
    }

    // ── 2. Cache check ────────────────────────────────────────────────────────
    if (useCache) {
      const cached = await this.findFreshAnalysis(resumeId, jobId, resume.updatedAt, job.updatedAt);
      if (cached) {
        logger.debug({ resumeId, jobId, analysisId: cached.id }, 'Returning cached analysis');
        return this.hydrateFromDb(cached, weights);
      }
    }

    // ── 3. Prepare input data ─────────────────────────────────────────────────
    const parsedData = resume.parsedData;
    const resumeSkills = parsedData
      ? (parsedData.skills as string[])
      : extractSkillsFromText(resume.content?.extractedText ?? '');

    const resumeEducation: Education[] = parsedData
      ? (parsedData.education as unknown as Education[])
      : [];

    const resumeFullText = resume.content?.extractedText ?? '';
    const { required: requiredSkills, preferred: preferredSkills } = extractJobSkills(job.chunks);

    // Determine if embeddings are available for this resume+job pair
    const hasResumeEmbedding = await this.hasEmbeddings('resume', resumeId);
    const hasJobEmbedding = await this.hasEmbeddings('job', jobId);
    const embeddingsUsed = hasResumeEmbedding && hasJobEmbedding;

    logger.info(
      { resumeId, jobId, embeddingsUsed, requiredSkillCount: requiredSkills.length },
      'Starting analysis',
    );

    // ── 4. Gap analysis ───────────────────────────────────────────────────────
    const embeddingService = embeddingsUsed ? getEmbeddingService() : null;

    const gaps = await gapAnalysisService.findGaps({
      resumeSkills,
      requiredSkills,
      preferredSkills,
      embeddingService,
    });

    // ── 5. ATS scoring ────────────────────────────────────────────────────────
    const scores = await scoringService.computeAllScores({
      resumeId,
      jobId,
      resumeSkills,
      matchingSkills: gaps.matchingSkills,
      semanticMatches: gaps.semanticMatches,
      requiredSkills,
      resumeEducation,
      jobContent: job.content,
      resumeFullText,
      hasEmbeddings: embeddingsUsed,
    });

    const atsScore = scoringService.computeOverallScore(scores, weights);

    // ── 6. Strengths ──────────────────────────────────────────────────────────
    const strengths = await strengthService.findStrengthsForJob(resumeId, jobId, 3, embeddingsUsed);

    // ── 7. Keyword coverage ───────────────────────────────────────────────────
    const keywordCoverage = scoringService.computeKeywordCoverage(
      resumeFullText,
      job.content,
    );

    // ── 8. Build result ───────────────────────────────────────────────────────
    const analysisResult: Omit<AnalysisResult, 'id'> = {
      resumeId,
      jobId,
      atsScore,
      skillScore: scores.skill,
      experienceScore: scores.experience,
      educationScore: scores.education,
      keywordScore: scores.keyword,
      semanticScore: scores.semantic,
      matchingSkills: gaps.matchingSkills,
      missingRequiredSkills: gaps.missingRequiredSkills,
      missingPreferredSkills: gaps.missingPreferredSkills,
      strengths,
      keywordCoverage,
      scoringVersion: SCORING_VERSION,
      embeddingsUsed,
      weights,
      analyzedAt: new Date().toISOString(),
    };

    // ── 9. Persist ────────────────────────────────────────────────────────────
    if (save) {
      const saved = await prisma.matchAnalysis.create({
        data: {
          userId,
          resumeId,
          jobId,
          overallScore: atsScore,
          skillScore: scores.skill,
          experienceScore: scores.experience,
          educationScore: scores.education,
          keywordScore: scores.keyword,
          semanticScore: scores.semantic,
          matchingSkills: JSON.parse(JSON.stringify(gaps.matchingSkills)),
          missingRequiredSkills: JSON.parse(JSON.stringify(gaps.missingRequiredSkills)),
          missingPreferredSkills: JSON.parse(JSON.stringify(gaps.missingPreferredSkills)),
          strengths: JSON.parse(JSON.stringify(strengths)),
          keywordCoverage: JSON.parse(JSON.stringify(keywordCoverage)),
          scoringVersion: SCORING_VERSION,
          embeddingsUsed,
        },
      });

      logger.info(
        { analysisId: saved.id, atsScore, resumeId, jobId },
        'Analysis saved',
      );

      return { ...analysisResult, id: saved.id };
    }

    return { ...analysisResult, id: null };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private validateWeights(weights: ScoringWeights): void {
    const sum = Object.values(weights).reduce((s, w) => s + w, 0);
    if (Math.abs(sum - 1.0) > 0.001) {
      throw new AppError(
        `Scoring weights must sum to 1.0 (got ${sum.toFixed(3)})`,
        422,
      );
    }
  }

  private async hasEmbeddings(
    sourceType: 'resume' | 'job',
    sourceId: string,
  ): Promise<boolean> {
    if (sourceType === 'resume') {
      const chunk = await prisma.resumeChunk.findFirst({
        where: { resumeId: sourceId, embeddedAt: { not: null } },
        select: { id: true },
      });
      return chunk !== null;
    }
    const chunk = await prisma.jobChunk.findFirst({
      where: { jobId: sourceId, embeddedAt: { not: null } },
      select: { id: true },
    });
    return chunk !== null;
  }

  private async findFreshAnalysis(
    resumeId: string,
    jobId: string,
    resumeUpdatedAt: Date,
    jobUpdatedAt: Date,
  ) {
    const ttlCutoff = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000);

    return prisma.matchAnalysis.findFirst({
      where: {
        resumeId,
        jobId,
        scoringVersion: SCORING_VERSION,
        createdAt: {
          gte: new Date(Math.max(
            ttlCutoff.getTime(),
            resumeUpdatedAt.getTime(),
            jobUpdatedAt.getTime(),
          )),
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private hydrateFromDb(
    row: Awaited<ReturnType<typeof prisma.matchAnalysis.findFirst>> & object,
    weights: ScoringWeights,
  ): AnalysisResult {
    return {
      id: row!.id,
      resumeId: row!.resumeId,
      jobId: row!.jobId,
      atsScore: row!.overallScore,
      skillScore: row!.skillScore,
      experienceScore: row!.experienceScore,
      educationScore: row!.educationScore,
      keywordScore: row!.keywordScore,
      semanticScore: row!.semanticScore,
      matchingSkills: row!.matchingSkills as string[],
      missingRequiredSkills: row!.missingRequiredSkills as string[],
      missingPreferredSkills: row!.missingPreferredSkills as string[],
      strengths: row!.strengths as unknown as AnalysisResult['strengths'],
      keywordCoverage: row!.keywordCoverage as unknown as AnalysisResult['keywordCoverage'],
      scoringVersion: row!.scoringVersion,
      embeddingsUsed: row!.embeddingsUsed,
      weights,
      analyzedAt: row!.createdAt.toISOString(),
    };
  }
}

export const matchingService = new MatchingService();
