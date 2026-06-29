import { prisma } from '../config/database';
import { ForbiddenError, NotFoundError } from '../utils/errors';
import { chunkJobDescription } from '../chunkers/job.chunker';
import { getEmbeddingService } from '../embeddings';
import { logger } from '../utils/logger';
import type { CreateJobInput } from '../validators/job.validator';

export class JobService {
  // ── Create + chunk + embed ────────────────────────────────────────────────────
  //
  // After creating the job description row, the same chunk → embed pattern as
  // ResumeUploadService is applied. Embedding is best-effort: a missing API key
  // or transient failure is logged but doesn't fail the create request.
  //
  // Phase 4: move chunking/embedding into a BullMQ worker to keep response
  // latency under 200 ms regardless of content length or API availability.
  async create(userId: string, input: CreateJobInput) {
    const job = await prisma.jobDescription.create({
      data: { ...input, userId },
    });

    // ── Chunk job description ──────────────────────────────────────────────
    const chunks = chunkJobDescription({
      title: job.title,
      company: job.company,
      content: job.content,
    });

    if (chunks.length > 0) {
      await prisma.jobChunk.createMany({
        data: chunks.map((c) => ({
          jobId: job.id,
          chunkIndex: c.index,
          chunkType: c.type,
          content: c.content,
          wordCount: c.wordCount,
          tokenEstimate: c.tokenEstimate,
          metadata: JSON.parse(JSON.stringify(c.metadata)),
        })),
      });
    }

    logger.info({ jobId: job.id, chunkCount: chunks.length }, 'Job description chunked');

    // ── Embed chunks (best-effort) ─────────────────────────────────────────
    let embeddingMeta: Record<string, unknown> = { embeddingSkipped: true };
    const embeddingService = getEmbeddingService();

    if (embeddingService && chunks.length > 0) {
      try {
        const savedChunks = await prisma.jobChunk.findMany({
          where: { jobId: job.id },
          orderBy: { chunkIndex: 'asc' },
          select: { id: true, content: true },
        });

        const texts = savedChunks.map((c) => c.content);
        const embeddings = await embeddingService.embedBatch(texts);

        await Promise.all(
          savedChunks.map((chunk, i) =>
            prisma.$executeRawUnsafe(
              `UPDATE job_chunks
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
          embeddedAt: new Date().toISOString(),
        };

        logger.info(
          { jobId: job.id, model: embeddingService.modelId, count: chunks.length },
          'Job chunks embedded',
        );
      } catch (embErr) {
        logger.error(
          { err: embErr, jobId: job.id },
          'Job embedding failed — chunks stored without vectors',
        );
        embeddingMeta = {
          embeddingSkipped: true,
          embeddingError: (embErr as Error).message,
          chunkCount: chunks.length,
        };
      }
    }

    // Store embedding metadata on the job record.
    // JSON.parse/stringify strips Record<string, unknown> → any to satisfy Prisma's Json type.
    return prisma.jobDescription.update({
      where: { id: job.id },
      data: { metadata: JSON.parse(JSON.stringify(embeddingMeta)) },
    });
  }

  async findAllByUser(userId: string) {
    return prisma.jobDescription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      // Omit content and metadata from list responses to keep payloads small
      select: {
        id: true,
        title: true,
        company: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findOne(id: string, userId: string) {
    const job = await prisma.jobDescription.findUnique({ where: { id } });

    if (!job) throw new NotFoundError('Job description');
    if (job.userId !== userId) throw new ForbiddenError();

    return job;
  }

  async delete(id: string, userId: string): Promise<void> {
    const job = await prisma.jobDescription.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!job) throw new NotFoundError('Job description');
    if (job.userId !== userId) throw new ForbiddenError();

    await prisma.jobDescription.delete({ where: { id } });
  }
}

export const jobService = new JobService();
