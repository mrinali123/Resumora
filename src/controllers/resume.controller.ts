import { Request, Response } from 'express';
import { resumeService } from '../services/resume.service';
import { resumeUploadService } from '../services/resume-upload.service';
import { atsAnalysisService } from '../services/ats-analysis.service';
import { retrievalService } from '../retrieval/retrieval.service';
import { asyncHandler } from '../utils/async-handler';
import { logger } from '../utils/logger';
import { ValidationError } from '../utils/errors';
import { getQueues } from '../queue/queues';
import { jobTracker } from '../queue/job-tracker';
import { QUEUES, JOB_NAMES } from '../queue/jobs.types';
import { parseResume } from '../parser';
import { extractTextFromBuffer } from '../parsers/text-extractor';
import { assertValidFileMagicBytes } from '../config/upload';
import type { CreateResumeInput } from '../validators/resume.validator';
import type { ProcessResumePayload } from '../queue/jobs.types';

// Fire-and-forget baseline ATS analysis for sync upload paths.
// The BullMQ worker handles this automatically on the async path; these helpers
// cover the two sync fallback cases (queue timeout + no-Redis environment).
// Errors are swallowed — a scoring failure must never affect the upload response.
function scheduleAutoAts(userId: string, resumeId: string): void {
  setImmediate(() => {
    atsAnalysisService.analyze(userId, resumeId, undefined)
      .then((r) =>
        logger.info(
          { resumeId, userId, atsScore: r.overallScore, grade: r.grade },
          'Sync-path auto ATS persisted — History will show score immediately',
        ),
      )
      .catch((err) =>
        logger.warn(
          { err: (err as Error).message, resumeId, userId },
          'Sync-path auto ATS failed — non-fatal; manual analysis still available',
        ),
      );
  });
}

// ── Phase 1 ── Metadata-only create ──────────────────────────────────────────
export const createResume = asyncHandler(async (req: Request, res: Response) => {
  const resume = await resumeService.create(req.user!.userId, req.body as CreateResumeInput);
  res.status(201).json({ success: true, data: resume });
});

// ── Phase 2/6 ── Multipart file upload ───────────────────────────────────────
// When Redis + BullMQ are available: enqueue async job, return 202 + jobId.
// When Redis is unavailable: fall back to synchronous processing, return 201.
// The async path is preferred in production — parsing + embedding can take 5–15s.
export const uploadResume = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    logger.warn(
      { headers: req.headers['content-type'], userId: req.user?.userId },
      'Upload request received but no file found — check Content-Type and field name',
    );
    throw new ValidationError('No file provided. Send the resume under the "file" form field.');
  }

  // Validate actual file content against known magic bytes.
  // The MIME type check in multer is client-controlled and spoofable; this is not.
  await assertValidFileMagicBytes(req.file);

  logger.info(
    {
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      userId: req.user?.userId,
    },
    'Resume upload received',
  );

  const queues = getQueues();

  if (queues) {
    // ── Async path (Phase 6 default) ──────────────────────────────────────────
    // Create a stub resume record first so we have an ID to return immediately.
    const stub = await resumeService.createStub(
      req.user!.userId,
      req.body.title as string | undefined,
      req.file,
    );

    const payload: ProcessResumePayload = {
      version: '1',
      resumeId: stub.id,
      userId: req.user!.userId,
      filePath: req.file.path,
      originalFileName: req.file.originalname,
      mimeType: req.file.mimetype,
      correlationId: req.requestId,
    };

    // Timeout safety net: if Redis was available at startup but goes down during
    // the request, queue.add() would hang indefinitely (maxRetriesPerRequest: null).
    // A 5-second timeout falls back to sync processing using the already-created stub.
    let job: Awaited<ReturnType<typeof queues.resumeProcessing.add>>;
    try {
      job = await Promise.race([
        queues.resumeProcessing.add(JOB_NAMES.PROCESS_RESUME, payload, {
          jobId: stub.id, // Use resumeId as jobId so clients can poll by resumeId
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Redis queue unavailable (5s timeout)')),
            5_000,
          ),
        ),
      ]);
    } catch (queueErr) {
      // Queue is down — fall back to synchronous processing on the stub we created.
      logger.warn(
        { err: queueErr, resumeId: stub.id },
        'Queue.add() failed or timed out — falling back to sync processing',
      );

      const processed = await resumeUploadService.processExistingResume(stub.id, req.file);

      // Queue fell back to sync — run baseline ATS after the response so we
      // don't block the HTTP reply.
      scheduleAutoAts(req.user!.userId, processed.id);

      return res.status(201).json({
        success: true,
        async: false,
        data: {
          resumeId: processed.id,
          async: false,
          status: processed.status,
        },
      });
    }

    // Initialise status so GET /queue-jobs/:id/status returns immediately
    await jobTracker.setStatus(job.id!, {
      status: 'waiting',
      userId: req.user!.userId,
      queue: QUEUES.RESUME_PROCESSING,
      jobName: JOB_NAMES.PROCESS_RESUME,
      progress: 0,
      message: 'Queued for processing',
    });

    return res.status(202).json({
      success: true,
      async: true,
      data: {
        resumeId: stub.id,
        jobId: job.id,
        status: 'waiting',
        statusUrl: `/api/v1/queue-jobs/${job.id!}/status`,
        resultUrl: `/api/v1/queue-jobs/${job.id!}/result`,
      },
    });
  }

  // ── Sync fallback (no Redis) ──────────────────────────────────────────────
  // Returns the same { resumeId, async, status } shape as the async path so the
  // frontend doesn't need to branch on the envelope format.
  const processed = await resumeUploadService.processUpload(
    req.user!.userId,
    req.file,
    req.body.title as string | undefined,
  );

  // No-Redis sync path: run baseline ATS after the response is sent.
  scheduleAutoAts(req.user!.userId, processed.id);

  return res.status(201).json({
    success: true,
    async: false,
    data: {
      resumeId: processed.id,
      async: false,
      status: processed.status,
    },
  });
});

// ── List ──────────────────────────────────────────────────────────────────────
export const getResumes = asyncHandler(async (req: Request, res: Response) => {
  const resumes = await resumeService.findAllByUser(req.user!.userId);
  res.status(200).json({ success: true, count: resumes.length, data: resumes });
});

// ── Single resume metadata ────────────────────────────────────────────────────
export const getResume = asyncHandler(async (req: Request, res: Response) => {
  const resume = await resumeService.findOne(req.params.id, req.user!.userId);
  res.status(200).json({ success: true, data: resume });
});

// ── Resume details (metadata + extracted text + parsed fields) ────────────────
export const getResumeDetails = asyncHandler(async (req: Request, res: Response) => {
  const details = await resumeService.findDetails(req.params.id, req.user!.userId);
  res.status(200).json({ success: true, data: details });
});

// ── Delete ────────────────────────────────────────────────────────────────────
// Returns 200 + JSON (not 204) so the api-client's safeJson() can parse the
// response without throwing. Cascade deletes via Prisma cover: ResumeContent,
// ParsedResume, ResumeChunk, AtsAnalysis, MatchAnalysis, ResumeComparison.
// The physical file is removed after the DB record is gone.
export const deleteResume = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  await resumeService.delete(id, req.user!.userId);
  logger.info({ resumeId: id, userId: req.user!.userId }, 'Resume deleted');
  res.status(200).json({ success: true, data: { deleted: true } });
});

// ── Parser v3: stateless parse endpoint ───────────────────────────────────────
// POST /api/v1/resumes/parse
//
// Accepts either:
//   a) multipart/form-data with a `file` field (PDF or DOCX)
//   b) application/json with a `text` string field
//
// Returns structured ResumeParseResult immediately — does NOT persist to DB.
// Used by the frontend "preview" flow and integration tests.
export const parseResumeEndpoint = asyncHandler(async (req: Request, res: Response) => {
  let rawText: string;

  if (req.file) {
    // Validate magic bytes — MIME type from the client is trivially spoofable
    await assertValidFileMagicBytes(req.file);
    // File upload path
    const extracted = await extractTextFromBuffer(
      req.file.buffer ?? require('fs').readFileSync(req.file.path),
      req.file.mimetype,
      req.file.originalname,
    );
    rawText = extracted.text;
  } else if (typeof (req.body as Record<string, unknown>).text === 'string') {
    rawText = (req.body as { text: string }).text;
  } else {
    throw new ValidationError(
      'Provide a resume file (multipart/form-data) or a "text" field (application/json).',
    );
  }

  const result = await parseResume(rawText, {
    userId: req.user?.userId,
    skipLlm: !req.user?.userId, // skip LLM if unauthenticated (no userId for tracking)
  });

  // Strip internal _meta from response unless debug mode is on
  const { _meta, ...publicResult } = result;

  res.status(200).json({
    success: true,
    data: publicResult,
    ...(req.query.debug === '1' ? { _meta } : {}),
  });
});

// ── Phase 3: similar resumes (vector similarity) ──────────────────────────────
export const getSimilarResumes = asyncHandler(async (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 5;
  const similar = await retrievalService.findSimilarResumes(
    req.params.id,
    req.user!.userId,
    limit,
  );
  res.json({ success: true, count: similar.length, data: similar });
});
