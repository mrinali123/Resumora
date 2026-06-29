import { prisma } from '../config/database';
import { ForbiddenError, NotFoundError } from '../utils/errors';
import { matchingService } from './matching.service';
import { aiService } from '../ai/ai.service';
import { contextBuilder } from '../ai/context/context-builder';
import { improveResumePrompt } from '../ai/prompts/registry';
import { extractSkillsFromText } from './skills.utils';
import type { ImproveResumeContext } from '../ai/prompts/registry';

export interface ImprovementSuggestion {
  section: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  issue: string;
  suggestion: string;
  example?: string;
}

export interface ImproveResumeResult {
  overallAssessment: string;
  suggestions: ImprovementSuggestion[];
  quickWins: string[];
  atsKeywordsToAdd: string[];
  cached: boolean;
}

export class ImproveResumeService {
  async run(
    resumeId: string,
    jobId: string,
    userId: string,
    forceRefresh = false,
  ): Promise<ImproveResumeResult> {
    // ── Ownership ──────────────────────────────────────────────────────────
    const [resume, job] = await Promise.all([
      prisma.resume.findUnique({
        where: { id: resumeId },
        include: { parsedData: { select: { candidateName: true, skills: true } } },
      }),
      prisma.jobDescription.findUnique({
        where: { id: jobId },
        select: { userId: true, title: true, company: true, content: true },
      }),
    ]);

    if (!resume) throw new NotFoundError('Resume');
    if (resume.userId !== userId) throw new ForbiddenError();
    if (!job) throw new NotFoundError('Job description');
    if (job.userId !== userId) throw new ForbiddenError();

    // ── Load or run Phase 4 analysis (for ATS score + gap data) ───────────
    const analysis = await matchingService.analyze(resumeId, jobId, userId, {
      save: true,
      useCache: true,
    });

    // ── Build RAG context ──────────────────────────────────────────────────
    const ctx = await contextBuilder.build(resumeId, jobId, {
      resumeChunkTypes: ['SUMMARY', 'SKILLS', 'EXPERIENCE', 'PROJECT'],
      jobChunkTypes: ['REQUIREMENTS', 'RESPONSIBILITIES', 'QUALIFICATIONS'],
    });

    const resumeSkills = resume.parsedData
      ? (resume.parsedData.skills as string[])
      : extractSkillsFromText(ctx.resumeText);

    const keywordGaps = (analysis.keywordCoverage as { missing?: string[] }).missing ?? [];

    const promptContext: ImproveResumeContext = {
      candidateName: (resume.parsedData?.candidateName as string) ?? 'Candidate',
      targetRole: job.title,
      targetCompany: job.company ?? undefined,
      resumeContext: ctx.resumeText,
      jobContext: ctx.jobText,
      atsScore: Math.round(analysis.atsScore),
      missingSkills: analysis.missingRequiredSkills as string[],
      keywordGaps,
    };

    // ── Run LLM ────────────────────────────────────────────────────────────
    const result = await aiService.run<ImproveResumeContext, ImproveResumeResult>({
      userId,
      endpoint: 'improve-resume',
      template: improveResumePrompt,
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

export const improveResumeService = new ImproveResumeService();
