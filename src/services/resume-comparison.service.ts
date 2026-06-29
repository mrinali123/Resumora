// Resume Comparison Service
//
// Loads two stored ParsedResume rows, converts them to ResumeJson, runs
// compare_resumes(), and persists the result to ResumeComparison.
//
// Production hardening (Phase 7):
//   - Cache: Redis key includes both parsedData.updatedAt timestamps so
//     re-uploading either resume auto-busts the cached comparison result.
//   - Status guard: rejects resumes that are not yet PROCESSED with 409
//   - Logging: structured info log per comparison with durationMs
//   - Metrics: latency histogram + totals counter

import { createHash } from 'crypto';
import { prisma } from '../config/database';
import { compare_resumes } from '../resume-comparison/pipeline';
import { toResumeJson } from '../utils/parsed-resume.mapper';
import { NotFoundError, ForbiddenError, BadRequestError, ConflictError } from '../utils/errors';
import { logger } from '../utils/logger';
import { cacheService } from '../cache/cache.service';
import { CacheKeys } from '../cache/cache-keys';
import { metricsService } from '../metrics/metrics.service';

// 12 hours — shorter than the analysis TTL because comparisons embed both
// resume states and become stale faster when either resume is re-uploaded.
const COMPARISON_CACHE_TTL = 12 * 60 * 60;

// ─── Public response shapes ────────────────────────────────────────────────────

export interface ComparisonSummary {
  comparisonId:          string;
  resumeAId:             string;
  resumeBId:             string;
  improvementScoreDelta: number;
  atsScoreChange:        number;
  addedSkills:           string[];
  removedSkills:         string[];
  isMeaningfulUpgrade:   boolean;
  hasRegressions:        boolean;
  explanation:           string;
  recruiterSummary:      string;
  createdAt:             Date;
}

export interface ComparisonDetail extends ComparisonSummary {
  fullResult: unknown;
}

function toSummary(row: {
  id: string;
  resumeAId: string;
  resumeBId: string;
  improvementScoreDelta: number;
  atsScoreChange: number;
  addedSkills: unknown;
  removedSkills: unknown;
  isMeaningfulUpgrade: boolean;
  hasRegressions: boolean;
  explanation: string;
  recruiterSummary: string;
  createdAt: Date;
}): ComparisonSummary {
  return {
    comparisonId:          row.id,
    resumeAId:             row.resumeAId,
    resumeBId:             row.resumeBId,
    improvementScoreDelta: row.improvementScoreDelta,
    atsScoreChange:        row.atsScoreChange,
    addedSkills:           row.addedSkills as string[],
    removedSkills:         row.removedSkills as string[],
    isMeaningfulUpgrade:   row.isMeaningfulUpgrade,
    hasRegressions:        row.hasRegressions,
    explanation:           row.explanation,
    recruiterSummary:      row.recruiterSummary,
    createdAt:             row.createdAt,
  };
}

function makeJdHash(jobDescription?: string): string {
  const text = jobDescription?.trim();
  if (!text) return 'nojd';
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

function guardResumeStatus(
  resumeId: string,
  status: string,
  label: 'A' | 'B',
): void {
  if (status === 'PENDING') {
    throw new ConflictError(`Resume ${label} (${resumeId}) has not been processed yet. Try again shortly.`);
  }
  if (status === 'PROCESSING') {
    throw new ConflictError(`Resume ${label} (${resumeId}) is still being processed. Try again in a few seconds.`);
  }
  if (status === 'FAILED') {
    throw new ConflictError(`Resume ${label} (${resumeId}) processing failed. Please re-upload the file.`);
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ResumeComparisonService {
  // ── Compare two stored resumes ────────────────────────────────────────────
  async compare(
    userId: string,
    resumeAId: string,
    resumeBId: string,
    jobDescription?: string,
  ): Promise<ComparisonDetail> {
    if (resumeAId === resumeBId) {
      throw new BadRequestError('resumeAId and resumeBId must be different resumes');
    }

    // ── 1. Load both resumes in parallel ───────────────────────────────────
    const [resumeA, resumeB] = await Promise.all([
      prisma.resume.findUnique({
        where: { id: resumeAId },
        select: { userId: true, status: true, title: true, parsedData: true },
      }),
      prisma.resume.findUnique({
        where: { id: resumeBId },
        select: { userId: true, status: true, title: true, parsedData: true },
      }),
    ]);

    if (!resumeA) throw new NotFoundError('Resume A');
    if (!resumeB) throw new NotFoundError('Resume B');
    if (resumeA.userId !== userId) throw new ForbiddenError();
    if (resumeB.userId !== userId) throw new ForbiddenError();

    // ── 2. Status guards ───────────────────────────────────────────────────
    guardResumeStatus(resumeAId, resumeA.status, 'A');
    guardResumeStatus(resumeBId, resumeB.status, 'B');

    if (!resumeA.parsedData) throw new NotFoundError('Parsed data for Resume A');
    if (!resumeB.parsedData) throw new NotFoundError('Parsed data for Resume B');

    // ── 3. Cache check ─────────────────────────────────────────────────────
    const jdHash = makeJdHash(jobDescription);
    const cacheKey = CacheKeys.resumeComparison(
      resumeAId, resumeA.parsedData.updatedAt.getTime(),
      resumeBId, resumeB.parsedData.updatedAt.getTime(),
      jdHash,
    );

    const cached = await cacheService.get<ComparisonDetail>(cacheKey);
    if (cached) {
      logger.info({ resumeAId, resumeBId, cacheHit: true }, 'Resume comparison cache hit');
      metricsService.increment('resume.comparison.cache_hit');
      return cached;
    }

    // ── 4. Convert → engine input ──────────────────────────────────────────
    const jsonA = toResumeJson(resumeA.parsedData);
    const jsonB = toResumeJson(resumeB.parsedData);

    logger.debug(
      { resumeAId, resumeBId, hasJd: Boolean(jobDescription) },
      'Running resume comparison engine',
    );

    // ── 5. Run engine ──────────────────────────────────────────────────────
    const startMs = Date.now();

    let result: ReturnType<typeof compare_resumes>;
    try {
      result = compare_resumes({
        resumeA:        jsonA,
        resumeB:        jsonB,
        jobDescription: jobDescription || undefined,
      });
    } catch (engineErr) {
      const durationMs = Date.now() - startMs;
      logger.error({ err: engineErr, resumeAId, resumeBId, durationMs }, 'Comparison engine error');
      metricsService.increment('resume.comparison.engine_error');
      throw new Error(
        'Comparison engine failed. One or both resumes may have incomplete parsed data.',
      );
    }

    // ── 6. Persist ─────────────────────────────────────────────────────────
    const row = await prisma.resumeComparison.create({
      data: {
        userId,
        resumeAId,
        resumeBId,
        jobDescription:        jobDescription || null,
        improvementScoreDelta: Math.round(result.improvement_score_delta),
        addedSkills:           JSON.parse(JSON.stringify(result.added_skills)),
        removedSkills:         JSON.parse(JSON.stringify(result.removed_skills)),
        improvedSections:      JSON.parse(JSON.stringify(result.improved_sections)),
        atsScoreChange:        Math.round(result.ats_score_change),
        isMeaningfulUpgrade:   result.is_meaningful_upgrade,
        hasRegressions:        result.has_regressions,
        explanation:           result.explanation,
        recruiterSummary:      result.recruiter_summary,
        fullResult:            JSON.parse(JSON.stringify(result)),
      },
    });

    // ── 7. Log + metrics ────────────────────────────────────────────────────
    const durationMs = Date.now() - startMs;
    logger.info(
      {
        comparisonId:  row.id,
        resumeAId,
        resumeBId,
        userId,
        delta:         result.improvement_score_delta,
        upgrade:       result.is_meaningful_upgrade,
        regressions:   result.has_regressions,
        durationMs,
        cacheHit:      false,
      },
      'Resume comparison complete',
    );
    metricsService.recordLatency('resume.comparison.duration_ms', durationMs);
    metricsService.increment('resume.comparison.total');

    // ── 8. Cache for subsequent identical requests ──────────────────────────
    const detail: ComparisonDetail = {
      ...toSummary(row),
      fullResult: row.fullResult,
    };
    cacheService.set(cacheKey, detail, COMPARISON_CACHE_TTL).catch(() => {});

    return detail;
  }

  // ── Fetch a single comparison (ownership-checked) ─────────────────────────
  async findOne(id: string, userId: string): Promise<ComparisonDetail> {
    const row = await prisma.resumeComparison.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundError('Comparison');

    return {
      ...toSummary(row),
      fullResult: row.fullResult,
    };
  }

  // ── All comparisons for a user ────────────────────────────────────────────
  async findAllByUser(
    userId: string,
    limit = 50,
    offset = 0,
  ) {
    const [rows, total] = await Promise.all([
      prisma.resumeComparison.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id:                    true,
          resumeAId:             true,
          resumeBId:             true,
          improvementScoreDelta: true,
          atsScoreChange:        true,
          isMeaningfulUpgrade:   true,
          hasRegressions:        true,
          addedSkills:           true,
          removedSkills:         true,
          explanation:           true,
          recruiterSummary:      true,
          createdAt:             true,
          resumeA: { select: { title: true } },
          resumeB: { select: { title: true } },
          // fullResult deliberately excluded from list view — only in detail
        },
      }),
      prisma.resumeComparison.count({ where: { userId } }),
    ]);

    return { rows, total };
  }
}

export const resumeComparisonService = new ResumeComparisonService();
