import { prisma } from '../config/database';
import { ForbiddenError, NotFoundError } from '../utils/errors';
import { matchingService } from './matching.service';
import { aiService } from '../ai/ai.service';
import { contextBuilder } from '../ai/context/context-builder';
import { careerCoachPrompt } from '../ai/prompts/registry';
import type { CareerCoachContext } from '../ai/prompts/registry';

export interface StrengthPoint {
  point: string;
  evidence: string;
}

export interface WeaknessPoint {
  point: string;
  impact: string;
}

export interface CareerCoachResult {
  headline: string;
  strengths: StrengthPoint[];
  weaknesses: WeaknessPoint[];
  immediateActions: string[];
  shortTermGoals: string[];
  longTermVision: string;
  confidenceMessage: string;
  cached: boolean;
}

export class CareerCoachService {
  async run(
    resumeId: string,
    jobId: string,
    userId: string,
    forceRefresh = false,
  ): Promise<CareerCoachResult> {
    const [resume, job] = await Promise.all([
      prisma.resume.findUnique({
        where: { id: resumeId },
        include: { parsedData: { select: { candidateName: true } } },
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

    // Career coach needs broader context — include more chunk types
    const ctx = await contextBuilder.build(resumeId, jobId, {
      resumeChunkTypes: ['SUMMARY', 'SKILLS', 'EXPERIENCE', 'PROJECT', 'EDUCATION'],
      jobChunkTypes: ['REQUIREMENTS', 'RESPONSIBILITIES', 'QUALIFICATIONS'],
    });

    const promptContext: CareerCoachContext = {
      candidateName: (resume.parsedData?.candidateName as string) ?? 'Candidate',
      targetRole: job.title,
      targetCompany: job.company ?? undefined,
      resumeContext: ctx.resumeText,
      jobContext: ctx.jobText,
      atsScore: Math.round(analysis.atsScore),
      skillScore: Math.round(analysis.skillScore),
      experienceScore: Math.round(analysis.experienceScore),
      educationScore: Math.round(analysis.educationScore),
      matchingSkills: analysis.matchingSkills as string[],
      missingRequiredSkills: analysis.missingRequiredSkills as string[],
    };

    const result = await aiService.run<CareerCoachContext, CareerCoachResult>({
      userId,
      endpoint: 'career-coach',
      template: careerCoachPrompt,
      context: promptContext,
      cacheInputs: {
        resumeId,
        jobId,
        analysisId: analysis.id ?? 'unsaved',
      },
      bypassCache: forceRefresh,
    });

    return { ...result.data, cached: result.cached };
  }
}

export const careerCoachService = new CareerCoachService();
