import type { PromptTemplate } from '../types';
import type { AIMessage } from '../../providers/types';

export interface LearningPlanContext {
  targetRole: string;
  currentSkills: string[];
  missingRequired: string[];
  missingPreferred: string[];
  weeklyHoursAvailable: number;
}

export const learningPlanPrompt: PromptTemplate<LearningPlanContext> = {
  name: 'learning-plan',
  version: '1.0',
  description: 'Generate a structured weekly + monthly learning plan to close skill gaps',
  cacheTtlSeconds: 86400, // 24 hours
  estimatedOutputTokens: 1200,

  build(ctx: LearningPlanContext): AIMessage[] {
    const totalSkillsToLearn = ctx.missingRequired.length + ctx.missingPreferred.length;
    const planWeeks = Math.max(4, Math.min(12, totalSkillsToLearn * 2));

    return [
      {
        role: 'system',
        content: `You are a structured learning coach who designs realistic, time-boxed study plans for software engineers. You understand how people actually learn: short focused sessions beat marathon sessions, projects beat passive reading, and spaced repetition matters.

Respond with a JSON object in this exact shape:
{
  "weeklyPlan": [
    {
      "week": 1,
      "theme": "short theme title",
      "focus": "what skills this week targets",
      "goals": ["specific measurable goal 1", "specific measurable goal 2"],
      "dailyCommitment": "e.g. 1.5 hours/day",
      "activities": ["activity type — not specific URLs"],
      "milestone": "what success looks like at end of this week"
    }
  ],
  "monthlyMilestones": [
    {
      "month": 1,
      "milestone": "what should be achieved",
      "skills": ["skills covered this month"],
      "checkpoint": "how to verify progress (e.g. build a project, pass a quiz)"
    }
  ],
  "progressionPath": ["ordered list of topics from start to job-ready"],
  "studyTips": ["2-3 evidence-based study tips specific to these skills"]
}

Do NOT include specific URLs, course names with prices, or paid resource recommendations. Keep activity descriptions generic: "Complete an official documentation tutorial", "Build a small CRUD project", etc.`,
      },
      {
        role: 'user',
        content: `Target role: ${ctx.targetRole}
Weekly hours available: ${ctx.weeklyHoursAvailable}
Plan length: ${planWeeks} weeks

Current skills (foundation to build on): ${ctx.currentSkills.slice(0, 15).join(', ')}

Must learn (required for role): ${ctx.missingRequired.join(', ') || 'none'}
Should learn (preferred / nice-to-have): ${ctx.missingPreferred.join(', ') || 'none'}

Design a structured ${planWeeks}-week plan that progressively builds these skills. Start with foundations that unblock other skills. Include hands-on projects. Assume the candidate has ${ctx.weeklyHoursAvailable} hours/week to invest.`,
      },
    ];
  },
};
