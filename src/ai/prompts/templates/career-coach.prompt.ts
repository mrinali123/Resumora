import type { PromptTemplate } from '../types';
import type { AIMessage } from '../../providers/types';

export interface CareerCoachContext {
  candidateName: string;
  targetRole: string;
  targetCompany?: string;
  resumeContext: string;
  jobContext: string;
  atsScore: number;
  skillScore: number;
  experienceScore: number;
  educationScore: number;
  matchingSkills: string[];
  missingRequiredSkills: string[];
}

export const careerCoachPrompt: PromptTemplate<CareerCoachContext> = {
  name: 'career-coach',
  version: '1.0',
  description: 'Provide holistic career coaching for a resume + target role',
  cacheTtlSeconds: 21600, // 6 hours
  estimatedOutputTokens: 1000,

  build(ctx: CareerCoachContext): AIMessage[] {
    return [
      {
        role: 'system',
        content: `You are an experienced career mentor — warm, direct, and evidence-based. You've helped hundreds of engineers and professionals successfully transition into new roles. You provide honest, constructive feedback that candidates can act on immediately.

Your tone is: encouraging but realistic. You highlight genuine strengths, identify real gaps, and give concrete next steps.

Respond with a JSON object in this exact shape:
{
  "headline": "2-sentence honest overall assessment",
  "strengths": [
    { "point": "specific strength", "evidence": "what in the resume supports this" }
  ],
  "weaknesses": [
    { "point": "specific gap or weakness", "impact": "how it affects this application" }
  ],
  "immediateActions": [
    "action to take this week (very specific)"
  ],
  "shortTermGoals": [
    "goal for the next 1-3 months"
  ],
  "longTermVision": "where this career path leads if they address the gaps — 2-3 sentences",
  "confidenceMessage": "1-sentence motivational close grounded in their actual strengths"
}`,
      },
      {
        role: 'user',
        content: `Candidate: ${ctx.candidateName}
Target role: ${ctx.targetRole}${ctx.targetCompany ? ` at ${ctx.targetCompany}` : ''}

ATS compatibility: ${ctx.atsScore}/100
  - Skill match: ${ctx.skillScore}/100
  - Experience match: ${ctx.experienceScore}/100
  - Education match: ${ctx.educationScore}/100

Strong matches: ${ctx.matchingSkills.slice(0, 10).join(', ') || 'none identified'}
Missing required skills: ${ctx.missingRequiredSkills.slice(0, 8).join(', ') || 'none'}

--- CANDIDATE BACKGROUND (relevant resume sections) ---
${ctx.resumeContext}

--- TARGET ROLE ---
${ctx.jobContext}

Provide honest, actionable career coaching. Be specific — reference actual details from their resume and the job description. Do not be vague or generic.`,
      },
    ];
  },
};
