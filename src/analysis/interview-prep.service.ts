import { prisma } from '../config/database';
import { ForbiddenError, NotFoundError } from '../utils/errors';
import { matchingService } from './matching.service';
import { aiService } from '../ai/ai.service';
import { contextBuilder } from '../ai/context/context-builder';
import { interviewPrepPrompt } from '../ai/prompts/registry';
import type { InterviewPrepContext } from '../ai/prompts/registry';

export type FocusArea = 'technical' | 'behavioral' | 'project';

export interface InterviewQuestion {
  question: string;
  rationale?: string;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  hint?: string;
  competency?: string;
  context?: string;
  skill?: string;
}

export interface InterviewPrepResult {
  technical: InterviewQuestion[];
  project: InterviewQuestion[];
  behavioral: InterviewQuestion[];
  gapProbes: InterviewQuestion[];
  cached: boolean;
}

export class InterviewPrepService {
  async run(
    resumeId: string,
    jobId: string,
    userId: string,
    focusAreas: FocusArea[] = [],
    forceRefresh = false,
  ): Promise<InterviewPrepResult> {
    const [resume, job] = await Promise.all([
      prisma.resume.findUnique({
        where: { id: resumeId },
        select: { userId: true },
      }),
      prisma.jobDescription.findUnique({
        where: { id: jobId },
        select: { userId: true, title: true, company: true },
      }),
    ]);

    if (!resume) throw new NotFoundError('Resume');
    if (resume.userId !== userId) throw new ForbiddenError();
    if (!job) throw new NotFoundError('Job description');
    if (job.userId !== userId) throw new ForbiddenError();

    const analysis = await matchingService.analyze(resumeId, jobId, userId, {
      save: true,
      useCache: true,
    });

    const ctx = await contextBuilder.build(resumeId, jobId, {
      resumeChunkTypes: ['SUMMARY', 'SKILLS', 'EXPERIENCE', 'PROJECT'],
      jobChunkTypes: ['REQUIREMENTS', 'RESPONSIBILITIES'],
    });

    const promptContext: InterviewPrepContext = {
      targetRole: job.title,
      targetCompany: job.company ?? undefined,
      resumeContext: ctx.resumeText,
      jobContext: ctx.jobText,
      missingSkills: analysis.missingRequiredSkills as string[],
      focusAreas,
    };

    const result = await aiService.run<InterviewPrepContext, InterviewPrepResult>({
      userId,
      endpoint: 'interview-prep',
      template: interviewPrepPrompt,
      context: promptContext,
      cacheInputs: {
        resumeId,
        jobId,
        focusAreas: focusAreas.sort().join(','),
        analysisId: analysis.id ?? 'unsaved',
      },
      bypassCache: forceRefresh,
    });

    return { ...result.data, cached: result.cached };
  }
}

export const interviewPrepService = new InterviewPrepService();
