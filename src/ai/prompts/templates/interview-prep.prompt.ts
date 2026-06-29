import type { PromptTemplate } from '../types';
import type { AIMessage } from '../../providers/types';

export interface InterviewPrepContext {
  targetRole: string;
  targetCompany?: string;
  resumeContext: string;      // skills, experience, project chunks
  jobContext: string;         // requirements, responsibilities chunks
  missingSkills: string[];
  focusAreas: ('technical' | 'behavioral' | 'project')[];
}

export const interviewPrepPrompt: PromptTemplate<InterviewPrepContext> = {
  name: 'interview-prep',
  version: '1.0',
  description: 'Generate tailored interview questions from resume + JD',
  cacheTtlSeconds: 43200, // 12 hours
  estimatedOutputTokens: 1200,

  build(ctx: InterviewPrepContext): AIMessage[] {
    const focusAll = ctx.focusAreas.length === 0 || ctx.focusAreas.length === 3;
    const includesTechnical = focusAll || ctx.focusAreas.includes('technical');
    const includesBehavioral = focusAll || ctx.focusAreas.includes('behavioral');
    const includesProject = focusAll || ctx.focusAreas.includes('project');

    return [
      {
        role: 'system',
        content: `You are a senior technical interviewer who has conducted 500+ engineering interviews. You write interview questions that are specific to the candidate's background and the job requirements — not generic templates. Questions probe depth, not just familiarity.

Respond with a JSON object in this exact shape:
{
  "technical": [
    {
      "question": "the question",
      "rationale": "why this question for this candidate",
      "difficulty": "EASY | MEDIUM | HARD",
      "hint": "what a strong answer would include"
    }
  ],
  "project": [
    {
      "question": "the question (references specific project/experience from resume)",
      "rationale": "what this probes"
    }
  ],
  "behavioral": [
    {
      "question": "STAR-format question",
      "competency": "leadership | collaboration | problem-solving | resilience | communication"
    }
  ],
  "gapProbes": [
    {
      "question": "question probing a skill gap",
      "skill": "the missing skill being probed"
    }
  ]
}`,
      },
      {
        role: 'user',
        content: `Candidate interviewing for: ${ctx.targetRole}${ctx.targetCompany ? ` at ${ctx.targetCompany}` : ''}

--- RESUME BACKGROUND ---
${ctx.resumeContext}

--- JOB REQUIREMENTS ---
${ctx.jobContext}

Skills the candidate is missing: ${ctx.missingSkills.slice(0, 6).join(', ') || 'none'}

Generate:
${includesTechnical ? '- 5 technical questions (specific to their tech stack and the job requirements)' : ''}
${includesProject ? '- 3 project-based questions (reference specific projects/companies from their resume)' : ''}
${includesBehavioral ? '- 4 behavioral questions (tailored to what the role requires)' : ''}
- 2–3 gap probe questions (gently surface missing skills)

Questions must be specific to THIS candidate and THIS role — not generic. Reference real details from the resume.`,
      },
    ];
  },
};
