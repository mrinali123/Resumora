import type { PromptTemplate } from '../types';
import type { AIMessage } from '../../providers/types';

export interface ImproveResumeContext {
  candidateName: string;
  targetRole: string;
  targetCompany?: string;
  resumeContext: string;   // assembled RAG context from resume chunks
  jobContext: string;      // assembled RAG context from job chunks
  atsScore: number;
  missingSkills: string[];
  keywordGaps: string[];
}

export const improveResumePrompt: PromptTemplate<ImproveResumeContext> = {
  name: 'improve-resume',
  version: '1.0',
  description: 'Generate specific, actionable resume improvement suggestions for a target role',
  cacheTtlSeconds: 21600, // 6 hours
  estimatedOutputTokens: 800,

  build(ctx: ImproveResumeContext): AIMessage[] {
    const missingList = ctx.missingSkills.length > 0
      ? ctx.missingSkills.slice(0, 10).join(', ')
      : 'none identified';
    const keywordList = ctx.keywordGaps.length > 0
      ? ctx.keywordGaps.slice(0, 8).join(', ')
      : 'none';

    return [
      {
        role: 'system',
        content: `You are an expert ATS resume consultant and career coach with 15 years of experience helping candidates land roles at top tech companies. Your suggestions are specific, evidence-based, and immediately actionable. You never fabricate experience or skills. You focus on presentation improvements, not content invention.

Respond with a JSON object in this exact shape:
{
  "overallAssessment": "2-3 sentence honest assessment",
  "suggestions": [
    {
      "section": "experience | skills | summary | education | projects",
      "priority": "HIGH | MEDIUM | LOW",
      "issue": "concise description of the problem",
      "suggestion": "specific actionable fix (1-2 sentences)",
      "example": "optional concrete example of improved phrasing"
    }
  ],
  "quickWins": ["list of 3-5 changes that take under 5 minutes each"],
  "atsKeywordsToAdd": ["keywords from job description not in resume"]
}`,
      },
      {
        role: 'user',
        content: `Candidate: ${ctx.candidateName}
Target role: ${ctx.targetRole}${ctx.targetCompany ? ` at ${ctx.targetCompany}` : ''}
Current ATS compatibility score: ${ctx.atsScore}/100

--- RESUME SECTIONS (most relevant to this role) ---
${ctx.resumeContext}

--- JOB REQUIREMENTS ---
${ctx.jobContext}

--- GAP ANALYSIS ---
Missing required skills: ${missingList}
Missing keywords: ${keywordList}

Provide 5–8 specific improvement suggestions ordered by impact. For each suggestion, cite the exact resume section and explain the specific change needed. Focus on: (1) adding measurable metrics to bullet points, (2) incorporating missing keywords naturally, (3) restructuring for ATS readability, (4) strengthening weak action verbs.`,
      },
    ];
  },
};
