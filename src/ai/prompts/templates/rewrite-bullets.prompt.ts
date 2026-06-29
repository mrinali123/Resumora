import type { PromptTemplate } from '../types';
import type { AIMessage } from '../../providers/types';

export interface RewriteBulletsContext {
  bullets: string[];
  targetRole?: string;
  jobContext?: string;   // optional JD context for keyword alignment
}

export const rewriteBulletsPrompt: PromptTemplate<RewriteBulletsContext> = {
  name: 'rewrite-bullets',
  version: '1.0',
  description: 'Rewrite resume bullet points to be action-oriented and ATS-friendly',
  cacheTtlSeconds: 3600, // 1 hour — input-specific
  estimatedOutputTokens: 600,

  build(ctx: RewriteBulletsContext): AIMessage[] {
    const bulletsBlock = ctx.bullets
      .map((b, i) => `${i + 1}. ${b}`)
      .join('\n');

    const jobContextBlock = ctx.jobContext
      ? `\n--- TARGET JOB CONTEXT (align keywords) ---\n${ctx.jobContext}\n`
      : '';

    return [
      {
        role: 'system',
        content: `You are an expert resume writer specializing in ATS optimization for technical roles. You rewrite bullet points to be stronger without fabricating or exaggerating experience.

CRITICAL RULES:
1. Never invent metrics, companies, technologies, or achievements that were not in the original
2. Never change the fundamental meaning of what the candidate did
3. If a metric exists (e.g. "50% faster"), keep it — do not remove or alter numbers
4. If no metric exists, suggest adding one only if the bullet strongly implies a measurable outcome
5. Start every bullet with a strong past-tense action verb
6. Follow STAR structure where applicable: action → context → result
7. Remove filler phrases: "responsible for", "helped with", "worked on", "assisted in"

Respond with a JSON object in this exact shape:
{
  "rewritten": [
    {
      "original": "exact original bullet",
      "improved": "rewritten bullet",
      "improvements": ["what changed: e.g. stronger verb, added metric, STAR structure, keyword aligned"]
    }
  ],
  "generalAdvice": "1-2 sentences of pattern-level advice for this set of bullets"
}`,
      },
      {
        role: 'user',
        content: `${ctx.targetRole ? `Target role: ${ctx.targetRole}\n` : ''}${jobContextBlock}
--- BULLETS TO REWRITE ---
${bulletsBlock}

Rewrite each bullet to be stronger, more ATS-friendly, and more impactful. Preserve the candidate's actual experience.`,
      },
    ];
  },
};
