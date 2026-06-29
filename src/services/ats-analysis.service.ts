// ATS Analysis Service
//
// Bridges the stateless explain_score() + simulate_recruiter() engines to
// PostgreSQL.  A single call to analyze() runs both engines against the
// resume's stored ParsedResume row, caches the result in Redis, and writes
// the combined result to AtsAnalysis.
//
// Production hardening (Phase 7):
//   - Cache: Redis key includes parsedData.updatedAt so re-uploads auto-bust
//   - Status guard: rejects PENDING / PROCESSING / FAILED resumes with 409
//   - Logging: structured info log per analysis with durationMs + decision
//   - Metrics: latency histogram + per-decision counters
//   - Async path: enqueueAnalyze() drops a job to the ai-analysis queue

import { createHash, randomUUID } from 'crypto';
import { prisma } from '../config/database';
import { explain_score } from '../ats-scoring/pipeline';
import { simulate_recruiter } from '../recruiter-sim/pipeline';
import { toResumeJson } from '../utils/parsed-resume.mapper';
import { NotFoundError, ForbiddenError, ConflictError } from '../utils/errors';
import { logger } from '../utils/logger';
import { cacheService } from '../cache/cache.service';
import { CacheKeys } from '../cache/cache-keys';
import { metricsService } from '../metrics/metrics.service';
import { getQueues } from '../queue/queues';
import { jobTracker } from '../queue/job-tracker';
import { QUEUES, JOB_NAMES } from '../queue/jobs.types';
import type { AnalyzeResumePayload, AnalyzeResumeResult } from '../queue/jobs.types';

const SCORING_VERSION = '1.0.0';
// 24 hours — long enough to cover repeated requests within a work session,
// short enough that a scoring version bump clears stale cached results overnight.
const ANALYSIS_CACHE_TTL = 24 * 60 * 60;

// ─── Shape returned to controllers ────────────────────────────────────────────

export interface AtsAnalysisResponse {
  analysisId:          string;
  resumeId:            string;
  overallScore:        number;
  grade:               string;
  components:          unknown[];
  strengths:           string[];
  improvementAreas:    string[];
  summary:             string;
  recruiter: {
    shortlistProbability: number;
    decision:             string;
    topRedFlags:          unknown[];
    topStrengths:         unknown[];
    missingRequirements:  unknown[];
    recruiterNotes:       string;
  };
  scoringVersion: string;
  createdAt:      Date;
}

function formatResponse(row: {
  id: string;
  resumeId: string;
  overallScore: number;
  grade: string;
  components: unknown;
  strengths: unknown;
  improvementAreas: unknown;
  summary: string;
  shortlistProbability: number;
  recruiterDecision: string;
  topRedFlags: unknown;
  topStrengths: unknown;
  missingRequirements: unknown;
  recruiterNotes: string;
  scoringVersion: string;
  createdAt: Date;
}): AtsAnalysisResponse {
  return {
    analysisId:       row.id,
    resumeId:         row.resumeId,
    overallScore:     row.overallScore,
    grade:            row.grade,
    components:       row.components as unknown[],
    strengths:        row.strengths as string[],
    improvementAreas: row.improvementAreas as string[],
    summary:          row.summary,
    recruiter: {
      shortlistProbability: row.shortlistProbability,
      decision:             row.recruiterDecision,
      topRedFlags:          row.topRedFlags as unknown[],
      topStrengths:         row.topStrengths as unknown[],
      missingRequirements:  row.missingRequirements as unknown[],
      recruiterNotes:       row.recruiterNotes,
    },
    scoringVersion: row.scoringVersion,
    createdAt:      row.createdAt,
  };
}

function makeJdHash(jobDescription?: string): string {
  const text = jobDescription?.trim();
  if (!text) return 'nojd';
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class AtsAnalysisService {
  // ── Analyze a stored resume (synchronous path) ────────────────────────────
  async analyze(
    userId: string,
    resumeId: string,
    jobDescription?: string,
  ): Promise<AtsAnalysisResponse> {
    // ── 1. Load resume + parsedData ─────────────────────────────────────────
    const resume = await prisma.resume.findUnique({
      where: { id: resumeId },
      select: {
        userId:     true,
        status:     true,
        parsedData: true,
      },
    });

    if (!resume) throw new NotFoundError('Resume');
    if (resume.userId !== userId) throw new ForbiddenError();

    // ── 2. Status guard ─────────────────────────────────────────────────────
    if (resume.status === 'PENDING') {
      throw new ConflictError('Resume upload is pending processing. Try again shortly.');
    }
    if (resume.status === 'PROCESSING') {
      throw new ConflictError('Resume is currently being processed. Try again in a few seconds.');
    }
    if (resume.status === 'FAILED') {
      throw new ConflictError('Resume processing failed. Please re-upload the file and try again.');
    }
    if (!resume.parsedData) {
      throw new NotFoundError('Parsed resume data — ensure the resume has been fully processed');
    }

    // ── 3. Cache check ──────────────────────────────────────────────────────
    const jdHash = makeJdHash(jobDescription);
    const cacheKey = CacheKeys.atsAnalysis(
      resumeId,
      resume.parsedData.updatedAt.getTime(),
      jdHash,
    );

    const cached = await cacheService.get<AtsAnalysisResponse>(cacheKey);
    if (cached) {
      logger.info({ resumeId, userId, cacheHit: true }, 'ATS analysis cache hit');
      metricsService.increment('ats.analysis.cache_hit');
      return cached;
    }

    // ── 4. Run engines ──────────────────────────────────────────────────────
    const startMs = Date.now();
    const resumeJson = toResumeJson(resume.parsedData);
    const jd = jobDescription ?? '';

    let ats: ReturnType<typeof explain_score>;
    let recruiter: ReturnType<typeof simulate_recruiter>;

    try {
      ats       = explain_score(resumeJson, jd);
      recruiter = simulate_recruiter({ resume: resumeJson, jobDescription: jd || undefined });
    } catch (engineErr) {
      const durationMs = Date.now() - startMs;
      logger.error({ err: engineErr, resumeId, durationMs }, 'ATS engine error');
      metricsService.increment('ats.analysis.engine_error');
      throw new Error(
        'Analysis engine failed. The resume data may be incomplete or in an unexpected format.',
      );
    }

    // ── 5. Persist ──────────────────────────────────────────────────────────
    const row = await prisma.atsAnalysis.create({
      data: {
        userId,
        resumeId,
        jobDescription:       jd || null,
        overallScore:         ats.overall_score,
        grade:                ats.grade,
        components:           JSON.parse(JSON.stringify(ats.components)),
        strengths:            JSON.parse(JSON.stringify(ats.strengths)),
        improvementAreas:     JSON.parse(JSON.stringify(ats.improvement_areas)),
        summary:              ats.summary,
        shortlistProbability: recruiter.shortlist_probability,
        recruiterDecision:    recruiter.recruiter_decision,
        topRedFlags:          JSON.parse(JSON.stringify(recruiter.top_red_flags)),
        topStrengths:         JSON.parse(JSON.stringify(recruiter.top_strengths)),
        missingRequirements:  JSON.parse(JSON.stringify(recruiter.missing_requirements)),
        recruiterNotes:       recruiter.recruiter_notes,
        scoringVersion:       SCORING_VERSION,
      },
    });

    // ── 6. Log + metrics ────────────────────────────────────────────────────
    const durationMs = Date.now() - startMs;
    logger.info(
      {
        resumeId,
        userId,
        analysisId:   row.id,
        hasJd:        Boolean(jd),
        overallScore: ats.overall_score,
        decision:     recruiter.recruiter_decision,
        durationMs,
        cacheHit:     false,
      },
      'ATS analysis complete',
    );
    metricsService.recordLatency('ats.analysis.duration_ms', durationMs);
    metricsService.increment('ats.analysis.total');
    metricsService.increment(`ats.analysis.decision.${recruiter.recruiter_decision.toLowerCase()}`);

    // ── 7. Populate cache for subsequent identical requests ─────────────────
    const response = formatResponse(row);
    cacheService.set(cacheKey, response, ANALYSIS_CACHE_TTL).catch(() => {});

    return response;
  }

  // ── Enqueue an async analysis (returns job ID for polling) ────────────────
  async enqueueAnalyze(
    userId: string,
    resumeId: string,
    jobDescription?: string,
  ): Promise<{ jobId: string }> {
    const queues = getQueues();
    if (!queues) {
      throw new ConflictError('Queue service unavailable — use synchronous mode (omit ?async=true)');
    }

    const payload: AnalyzeResumePayload = {
      version: '1',
      resumeId,
      userId,
      jobDescription: jobDescription || undefined,
      correlationId:  randomUUID(),
    };

    const job = await queues.aiAnalysis.add(JOB_NAMES.ANALYZE_RESUME, payload);

    await jobTracker.setStatus(job.id!, {
      status:   'waiting',
      queue:    QUEUES.AI_ANALYSIS,
      jobName:  JOB_NAMES.ANALYZE_RESUME,
      progress: 0,
      message:  'Analysis queued — waiting for worker',
    });

    logger.info({ resumeId, userId, jobId: job.id }, 'ATS analysis job enqueued');
    metricsService.increment('ats.analysis.job.enqueued');

    return { jobId: job.id! };
  }

  // ── Fetch a single analysis (ownership-checked) ───────────────────────────
  async findOne(id: string, userId: string): Promise<AtsAnalysisResponse> {
    const row = await prisma.atsAnalysis.findUnique({ where: { id } });
    if (!row)                throw new NotFoundError('Analysis');
    if (row.userId !== userId) throw new ForbiddenError();
    return formatResponse(row);
  }

  // ── All analyses for a resume (ordered by most recent) ───────────────────
  async findAllByResume(
    resumeId: string,
    userId: string,
    limit = 20,
  ) {
    const resume = await prisma.resume.findUnique({
      where: { id: resumeId },
      select: { userId: true },
    });
    if (!resume)                  throw new NotFoundError('Resume');
    if (resume.userId !== userId) throw new ForbiddenError();

    return prisma.atsAnalysis.findMany({
      where: { resumeId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id:                  true,
        resumeId:            true,
        overallScore:        true,
        grade:               true,
        recruiterDecision:   true,
        shortlistProbability: true,
        scoringVersion:      true,
        createdAt:           true,
        // Omit heavy JSON fields in list view — caller fetches detail separately
      },
    });
  }

  // ── All analyses for a user (dashboard / history) ────────────────────────
  async findAllByUser(
    userId: string,
    limit = 50,
    offset = 0,
  ) {
    const [rows, total] = await Promise.all([
      prisma.atsAnalysis.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id:                   true,
          resumeId:             true,
          overallScore:         true,
          grade:                true,
          recruiterDecision:    true,
          shortlistProbability: true,
          scoringVersion:       true,
          createdAt:            true,
          resume: {
            select: { title: true, originalFileName: true },
          },
        },
      }),
      prisma.atsAnalysis.count({ where: { userId } }),
    ]);

    return { rows, total };
  }
}

export const atsAnalysisService = new AtsAnalysisService();
