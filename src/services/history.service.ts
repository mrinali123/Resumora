// History Service
//
// Returns the authenticated user's uploaded resumes in reverse-chronological
// order, enriched with their latest ATS analysis score and latest job-fit score.
// Used by GET /api/v1/history.
//
// Root cause of previous bug (history always empty):
//   The old implementation returned AtsAnalysis + ResumeComparison rows, so a
//   user who uploaded resumes but hadn't run any analyses saw an empty list.
//   Additionally, the controller put items in `data` and total in `meta`, but
//   the frontend expected `data.items` and `data.total` — both were undefined.
//   Both bugs are fixed here and in the controller.

import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export interface HistoryItem {
  id:               string;
  title:            string;
  originalFileName: string;
  status:           'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED';
  fileSize:         number | null;
  mimeType:         string | null;
  createdAt:        Date;
  updatedAt:        Date;
  // Null when the user has not yet run an ATS analysis for this resume
  atsScore:         number | null;
  atsGrade:         string | null;
  // Null when the user has not yet run a job-fit analysis for this resume
  jobMatchScore:    number | null;
}

export class HistoryService {
  async getHistory(
    userId: string,
    limit  = 50,
    offset = 0,
  ): Promise<{ items: HistoryItem[]; total: number }> {
    const [rows, total] = await Promise.all([
      prisma.resume.findMany({
        where:   { userId },
        orderBy: { createdAt: 'desc' },
        skip:    offset,
        take:    limit,
        select: {
          id:               true,
          title:            true,
          originalFileName: true,
          status:           true,
          fileSize:         true,
          mimeType:         true,
          createdAt:        true,
          updatedAt:        true,
          // Single most-recent ATS analysis for this resume
          atsAnalyses: {
            orderBy: { createdAt: 'desc' },
            take:    1,
            select:  { overallScore: true, grade: true },
          },
          // Single most-recent job-fit analysis for this resume
          analyses: {
            orderBy: { createdAt: 'desc' },
            take:    1,
            select:  { overallScore: true },
          },
        },
      }),
      prisma.resume.count({ where: { userId } }),
    ]);

    const items: HistoryItem[] = rows.map((r) => ({
      id:               r.id,
      title:            r.title,
      originalFileName: r.originalFileName,
      status:           r.status,
      fileSize:         r.fileSize,
      mimeType:         r.mimeType,
      createdAt:        r.createdAt,
      updatedAt:        r.updatedAt,
      atsScore:         r.atsAnalyses[0]?.overallScore ?? null,
      atsGrade:         r.atsAnalyses[0]?.grade ?? null,
      jobMatchScore:    r.analyses[0]?.overallScore ?? null,
    }));

    const withAts      = items.filter((i) => i.atsScore      !== null).length;
    const withJobMatch = items.filter((i) => i.jobMatchScore !== null).length;

    logger.info(
      { userId, total, returned: items.length, withAts, withJobMatch, missing: total - withAts },
      'History query complete',
    );

    return { items, total };
  }
}

export const historyService = new HistoryService();
