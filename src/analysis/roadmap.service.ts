import { prisma } from '../config/database';
import { ForbiddenError, NotFoundError } from '../utils/errors';
import { matchingService } from './matching.service';
import { aiService } from '../ai/ai.service';
import { contextBuilder } from '../ai/context/context-builder';
import { roadmapPrompt } from '../ai/prompts/registry';
import { extractSkillsFromText } from './skills.utils';
import type { RoadmapContext } from '../ai/prompts/registry';

export interface RoadmapSkill {
  skill: string;
  priority: number;
  category: string;
  difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  estimatedWeeks: number;
  prerequisite: string | null;
  why: string;
  learningPath: string[];
}

export interface RoadmapResult {
  summary: string;
  roadmap: RoadmapSkill[];
  suggestedSequence: string[];
  estimatedTotalWeeks: number;
  cached: boolean;
}

export class RoadmapService {
  async run(
    resumeId: string,
    jobId: string,
    userId: string,
    weeklyHoursAvailable: number,
    forceRefresh = false,
  ): Promise<RoadmapResult> {
    const [resume, job] = await Promise.all([
      prisma.resume.findUnique({
        where: { id: resumeId },
        include: { parsedData: { select: { skills: true } } },
      }),
      prisma.jobDescription.findUnique({
        where: { id: jobId },
        select: { userId: true, title: true },
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
      resumeChunkTypes: ['SKILLS'],
      jobChunkTypes: ['REQUIREMENTS', 'QUALIFICATIONS'],
      tokenBudget: 1500,
    });

    const currentSkills = resume.parsedData
      ? (resume.parsedData.skills as string[])
      : extractSkillsFromText(ctx.resumeText);

    const promptContext: RoadmapContext = {
      targetRole: job.title,
      currentSkills,
      missingRequired: analysis.missingRequiredSkills as string[],
      missingPreferred: analysis.missingPreferredSkills as string[],
      jobRequirementsContext: ctx.jobText,
      weeklyHoursAvailable,
    };

    const result = await aiService.run<RoadmapContext, RoadmapResult>({
      userId,
      endpoint: 'roadmap',
      template: roadmapPrompt,
      context: promptContext,
      cacheInputs: {
        resumeId,
        jobId,
        weeklyHoursAvailable,
        analysisId: analysis.id ?? 'unsaved',
      },
      bypassCache: forceRefresh,
    });

    return { ...result.data, cached: result.cached };
  }
}

export const roadmapService = new RoadmapService();
