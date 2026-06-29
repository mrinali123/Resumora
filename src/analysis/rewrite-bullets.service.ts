import { prisma } from '../config/database';
import { ForbiddenError, NotFoundError } from '../utils/errors';
import { aiService } from '../ai/ai.service';
import { contextBuilder } from '../ai/context/context-builder';
import { rewriteBulletsPrompt } from '../ai/prompts/registry';
import type { RewriteBulletsContext } from '../ai/prompts/registry';

export interface RewrittenBullet {
  original: string;
  improved: string;
  improvements: string[];
}

export interface RewriteBulletsResult {
  rewritten: RewrittenBullet[];
  generalAdvice: string;
  cached: boolean;
}

export class RewriteBulletsService {
  async run(params: {
    userId: string;
    bullets: string[];
    jobId?: string;
    targetRole?: string;
    forceRefresh?: boolean;
  }): Promise<RewriteBulletsResult> {
    const { userId, bullets, jobId, targetRole, forceRefresh = false } = params;

    let jobText: string | undefined;

    if (jobId) {
      const job = await prisma.jobDescription.findUnique({
        where: { id: jobId },
        select: { userId: true, title: true },
      });
      if (!job) throw new NotFoundError('Job description');
      if (job.userId !== userId) throw new ForbiddenError();

      // Only load job requirement chunks for keyword context — no resume needed
      const ctx = await contextBuilder.build(
        // Pass a dummy resumeId: we only need job chunks here
        // Context builder gracefully returns empty resume blocks for non-existent resume
        'skip',
        jobId,
        {
          resumeChunkTypes: [],
          jobChunkTypes: ['REQUIREMENTS', 'RESPONSIBILITIES'],
          tokenBudget: 1200,
        },
      );
      jobText = ctx.jobText || undefined;
    }

    const promptContext: RewriteBulletsContext = {
      bullets,
      targetRole,
      jobContext: jobText,
    };

    // Cache key includes a hash of the bullets so different input sets get different caches
    const bulletsHash = bullets.map((b) => b.trim()).join('|');

    const result = await aiService.run<RewriteBulletsContext, RewriteBulletsResult>({
      userId,
      endpoint: 'rewrite-bullets',
      template: rewriteBulletsPrompt,
      context: promptContext,
      cacheInputs: {
        bulletsHash,
        jobId: jobId ?? 'none',
        targetRole: targetRole ?? 'none',
      },
      bypassCache: forceRefresh,
    });

    return { ...result.data, cached: result.cached };
  }
}

export const rewriteBulletsService = new RewriteBulletsService();
