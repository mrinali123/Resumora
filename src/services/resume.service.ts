import { prisma } from '../config/database';
import { NotFoundError } from '../utils/errors';
import { deleteStoredFile } from './file-storage.service';
import { logger } from '../utils/logger';
import type { CreateResumeInput } from '../validators/resume.validator';

export class ResumeService {
  // ── Metadata-only create (Phase 1, kept for backward-compat) ──────────────
  async create(userId: string, input: CreateResumeInput) {
    return prisma.resume.create({
      data: { ...input, userId },
    });
  }

  // ── Stub create (Phase 6 async path) ─────────────────────────────────────
  // Creates a PENDING resume record with no content — the BullMQ worker
  // fills it in. Returns only { id } because that is all the caller needs.
  async createStub(
    userId: string,
    title: string | undefined,
    file: Express.Multer.File,
  ): Promise<{ id: string }> {
    const resume = await prisma.resume.create({
      data: {
        userId,
        title: title?.trim() || file.originalname,
        originalFileName: file.originalname,
        storagePath: file.path,
        fileSize: file.size,
        mimeType: file.mimetype,
        status: 'PENDING',
      },
      select: { id: true },
    });
    return resume;
  }

  // ── List ──────────────────────────────────────────────────────────────────
  async findAllByUser(userId: string) {
    return prisma.resume.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      // Deliberately exclude storagePath, metadata, content, and parsedData
      // to keep list payloads small. Full data is available on /:id and /:id/details.
      select: {
        id: true,
        title: true,
        originalFileName: true,
        status: true,
        fileSize: true,
        mimeType: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  // ── Single resume (metadata only) ─────────────────────────────────────────
  async findOne(id: string, userId: string) {
    const resume = await prisma.resume.findFirst({ where: { id, userId } });
    if (!resume) throw new NotFoundError('Resume');
    return resume;
  }

  // ── Resume details (metadata + extracted text + parsed fields) ────────────
  // Kept as a separate endpoint because:
  //   - extractedText can be tens of KB — wasteful to load on every GET
  //   - parsedData's JSON arrays can be large for senior engineers
  //   - consumers (UI, match API) decide which level of detail they need
  async findDetails(id: string, userId: string) {
    const resume = await prisma.resume.findFirst({
      where: { id, userId },
      include: {
        content: {
          select: {
            extractedText: true,
            wordCount: true,
            pageCount: true,
            chunkBoundaries: true,
          },
        },
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
            parserVersion: true,
            rawOutput: true,
            createdAt: true,
          },
        },
      },
    });

    if (!resume) throw new NotFoundError('Resume');
    return resume;
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async delete(id: string, userId: string): Promise<void> {
    const resume = await prisma.resume.findFirst({
      where: { id, userId },
      select: { storagePath: true },
    });

    if (!resume) throw new NotFoundError('Resume');

    // Delete DB record first; cascade removes ResumeContent + ParsedResume.
    await prisma.resume.delete({ where: { id } });

    // Then clean up the physical file. Non-fatal so the DELETE still
    // returns 204 even if the file was already removed.
    if (resume.storagePath) {
      await deleteStoredFile(resume.storagePath).catch((err) => {
        logger.warn({ err, storagePath: resume.storagePath }, 'Failed to delete resume file');
      });
    }
  }
}

export const resumeService = new ResumeService();
