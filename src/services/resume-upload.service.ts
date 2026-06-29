import path from 'path';
import { prisma } from '../config/database';
import { readStoredFile } from './file-storage.service';
import { extractTextFromBuffer } from '../parsers/text-extractor';
import { runPipeline } from '../parser/pipeline';
import { chunkResume } from '../chunkers/resume.chunker';
import { getEmbeddingService } from '../embeddings';
import { logger } from '../utils/logger';

// ─── Upload + Parse + Chunk + Embed Pipeline ──────────────────────────────────
//
// Steps:
//   1. Persist file metadata (Resume row, status = PENDING)  ← sync path only
//   2. Read file from disk into memory
//   3. Extract raw text (pdf-parse or mammoth) → ResumeContent row
//   4. Parse structured fields (regex heuristics) → ParsedResume row
//   5. Chunk by semantic section → ResumeChunk rows
//   6. Generate embeddings (skipped if no OPENAI_API_KEY)
//   7. Update status = PROCESSED
//
// Async path (BullMQ): the controller creates the stub resume first, then
// calls processExistingResume() which runs steps 2-7 against the stub ID.
// Sync path (no Redis): processUpload() runs steps 1-7 inline.

type ProgressCallback = (step: string, pct: number) => Promise<void>;

export class ResumeUploadService {
  // ── Async path (Phase 6 BullMQ worker) ───────────────────────────────────
  async processExistingResume(
    resumeId: string,
    file: Pick<Express.Multer.File, 'path' | 'originalname' | 'mimetype'>,
    onProgress?: ProgressCallback,
  ) {
    const storagePath = path.relative(process.cwd(), file.path).replace(/\\/g, '/');
    return this._runPipeline(resumeId, storagePath, file.originalname, file.mimetype, onProgress);
  }

  // ── Sync path (no Redis) ──────────────────────────────────────────────────
  async processUpload(
    userId: string,
    file: Express.Multer.File,
    title?: string,
  ) {
    const storagePath = path.relative(process.cwd(), file.path).replace(/\\/g, '/');

    const resume = await prisma.resume.create({
      data: {
        userId,
        title: title?.trim() || file.originalname,
        originalFileName: file.originalname,
        storagePath,
        fileSize: file.size,
        mimeType: file.mimetype,
        status: 'PENDING',
      },
    });

    logger.info({ resumeId: resume.id, userId }, 'Resume record created — starting pipeline');
    return this._runPipeline(resume.id, storagePath, file.originalname, file.mimetype);
  }

  private async _runPipeline(
    resumeId: string,
    storagePath: string,
    originalFileName: string,
    mimeType: string,
    onProgress?: ProgressCallback,
  ) {
    const report = async (step: string, pct: number) => {
      if (onProgress) await onProgress(step, pct);
    };

    logger.info({ resumeId }, 'Resume pipeline starting');

    try {
      // ── Step 2: Read file ─────────────────────────────────────────────────
      await report('reading file', 10);
      const buffer = await readStoredFile(storagePath);

      // ── Step 3: Extract text ──────────────────────────────────────────────
      await report('extracting text', 25);
      const extracted = await extractTextFromBuffer(buffer, mimeType, originalFileName);

      await prisma.resumeContent.create({
        data: {
          resumeId,
          extractedText: extracted.text,
          wordCount: extracted.wordCount,
          pageCount: extracted.pageCount ?? null,
        },
      });

      // ── Step 4: Parse structure (Phase 3 pipeline) ───────────────────────
      await report('parsing structure', 45);

      // Fetch userId so the Phase 3 LLM cleanup can attribute usage correctly.
      const resumeRecord = await prisma.resume.findUnique({
        where: { id: resumeId },
        select: { userId: true },
      });

      const parsed = await runPipeline(extracted.text, {
        skipLlm: false,
        userId: resumeRecord?.userId ?? undefined,
      });

      // Phase 3 field mapping:
      //   parsed.name           → candidateName
      //   parsed.experience[].role         (mapper expects 'role')
      //   parsed.experience[].duration     (mapper expects 'duration')
      //   parsed.experience[].bulletPoints (mapper expects 'bulletPoints')
      //   parsed.projects[].techStack      (mapper expects 'techStack')
      //   parsed._meta.confidenceScore     → confidenceScore
      //   parsed._meta                     → rawOutput
      await prisma.parsedResume.create({
        data: {
          resumeId,
          candidateName: parsed.name,
          email: parsed.email,
          phone: parsed.phone,
          skills: JSON.parse(JSON.stringify(parsed.skills)),
          education: JSON.parse(JSON.stringify(parsed.education)),
          experience: JSON.parse(JSON.stringify(parsed.experience)),
          projects: JSON.parse(JSON.stringify(parsed.projects)),
          certifications: JSON.parse(JSON.stringify(parsed.certifications)),
          confidenceScore: parsed._meta.confidenceScore,
          parserVersion: parsed._meta.parserVersion,
          rawOutput: JSON.parse(JSON.stringify(parsed._meta)),
        },
      });

      // ── Step 5: Chunk resume by semantic section ──────────────────────────
      await report('chunking', 60);
      const chunks = chunkResume({
        extractedText: extracted.text,
        parsedData: {
          name: parsed.name,
          email: parsed.email,
          phone: parsed.phone,
          skills: parsed.skills,
          education: parsed.education,
          experience: parsed.experience,
          projects: parsed.projects,
          sectionMap: parsed._meta.sectionMap,
        },
      });

      if (chunks.length > 0) {
        await prisma.resumeChunk.createMany({
          data: chunks.map((c) => ({
            resumeId,
            chunkIndex: c.index,
            chunkType: c.type,
            content: c.content,
            wordCount: c.wordCount,
            tokenEstimate: c.tokenEstimate,
            metadata: JSON.parse(JSON.stringify(c.metadata)),
          })),
        });

        await prisma.resumeContent.update({
          where: { resumeId },
          data: {
            chunkBoundaries: chunks.map((c) => ({
              index: c.index,
              type: c.type,
              wordCount: c.wordCount,
            })),
          },
        });
      }

      logger.info({ resumeId, chunkCount: chunks.length }, 'Resume chunked');

      // ── Step 6: Generate and store embeddings ─────────────────────────────
      await report('embedding', 75);
      let embeddingMeta: Record<string, unknown> = { embeddingSkipped: true };

      const embeddingService = getEmbeddingService();
      if (embeddingService && chunks.length > 0) {
        try {
          const savedChunks = await prisma.resumeChunk.findMany({
            where: { resumeId },
            orderBy: { chunkIndex: 'asc' },
            select: { id: true, content: true },
          });

          const texts = savedChunks.map((c) => c.content);

          // 30-second timeout guards against network hangs.
          // The OpenAI SDK default timeout is 600s — without this, a single
          // unreachable API endpoint blocks the entire pipeline for 10 minutes.
          const EMBED_TIMEOUT_MS = 30_000;
          const embeddings = await Promise.race([
            embeddingService.embedBatch(texts, undefined, (done, total) => {
              logger.debug({ resumeId, done, total }, 'Embedding progress');
            }),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error(`Embedding timed out after ${EMBED_TIMEOUT_MS / 1000}s`)),
                EMBED_TIMEOUT_MS,
              ),
            ),
          ]);

          await Promise.all(
            savedChunks.map((chunk, i) =>
              prisma.$executeRawUnsafe(
                `UPDATE resume_chunks
                 SET embedding = $1::vector,
                     embedded_at = NOW(),
                     embedding_model = $2
                 WHERE id = $3`,
                `[${embeddings[i].join(',')}]`,
                embeddingService.modelId,
                chunk.id,
              ),
            ),
          );

          embeddingMeta = {
            embeddingModel: embeddingService.modelId,
            chunkCount: chunks.length,
            embeddedChunkCount: chunks.length,
            embeddedAt: new Date().toISOString(),
          };

          logger.info({ resumeId, model: embeddingService.modelId, count: chunks.length }, 'Chunks embedded');
        } catch (embErr) {
          logger.error({ err: embErr, resumeId }, 'Embedding step failed — stored without vectors');
          embeddingMeta = {
            embeddingSkipped: true,
            embeddingError: (embErr as Error).message,
            chunkCount: chunks.length,
          };
        }
      }

      // ── Step 7: Mark as PROCESSED ─────────────────────────────────────────
      await report('finalising', 90);
      const processed = await prisma.resume.update({
        where: { id: resumeId },
        data: {
          status: 'PROCESSED',
          metadata: {
            ...embeddingMeta,
            wordCount: extracted.wordCount,
            pageCount: extracted.pageCount,
            parserConfidence: parsed._meta.confidenceScore,
          },
        },
        include: {
          content: { select: { wordCount: true, pageCount: true } },
          parsedData: {
            select: {
              candidateName: true,
              email: true,
              phone: true,
              skills: true,
              education: true,
              experience: true,
              projects: true,
              confidenceScore: true,
            },
          },
        },
      });

      await report('complete', 100);
      logger.info(
        { resumeId, wordCount: extracted.wordCount, confidenceScore: parsed._meta.confidenceScore, chunkCount: chunks.length },
        'Resume pipeline complete',
      );

      return processed;
    } catch (err) {
      await prisma.resume.update({
        where: { id: resumeId },
        data: {
          status: 'FAILED',
          metadata: { error: (err as Error).message, failedAt: new Date().toISOString() },
        },
      });

      logger.error({ err, resumeId }, 'Resume pipeline failed');
      throw err;
    }
  }
}

export const resumeUploadService = new ResumeUploadService();
