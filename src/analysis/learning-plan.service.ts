import { prisma } from '../config/database';
import { ForbiddenError, NotFoundError } from '../utils/errors';
import { matchingService } from './matching.service';
import { aiService } from '../ai/ai.service';
import { learningPlanPrompt } from '../ai/prompts/registry';
import { extractSkillsFromText } from './skills.utils';
import type { LearningPlanContext } from '../ai/prompts/registry';

export interface WeeklyPlan {
  week: number;
  theme: string;
  focus: string;
  goals: string[];
  dailyCommitment: string;
  activities: string[];
  milestone: string;
}

export interface MonthlyMilestone {
  month: number;
  milestone: string;
  skills: string[];
  checkpoint: string;
}

export interface LearningPlanResult {
  weeklyPlan: WeeklyPlan[];
  monthlyMilestones: MonthlyMilestone[];
  progressionPath: string[];
  studyTips: string[];
  cached: boolean;
}

export class LearningPlanService {
  async run(
    resumeId: string,
    jobId: string,
    userId: string,
    weeklyHoursAvailable: number,
    forceRefresh = false,
  ): Promise<LearningPlanResult> {
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

    const currentSkills = resume.parsedData
      ? (resume.parsedData.skills as string[])
      : extractSkillsFromText('');

    const promptContext: LearningPlanContext = {
      targetRole: job.title,
      currentSkills,
      missingRequired: analysis.missingRequiredSkills as string[],
      missingPreferred: analysis.missingPreferredSkills as string[],
      weeklyHoursAvailable,
    };

    const result = await aiService.run<LearningPlanContext, LearningPlanResult>({
      userId,
      endpoint: 'learning-plan',
      template: learningPlanPrompt,
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

export const learningPlanService = new LearningPlanService();
