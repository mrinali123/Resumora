import type { PromptTemplate } from '../types';
import type { AIMessage } from '../../providers/types';

export interface RoadmapContext {
  targetRole: string;
  currentSkills: string[];
  missingRequired: string[];      // HIGH priority gaps
  missingPreferred: string[];     // MEDIUM priority gaps
  jobRequirementsContext: string; // raw JD requirements chunk
  weeklyHoursAvailable: number;
}

export const roadmapPrompt: PromptTemplate<RoadmapContext> = {
  name: 'roadmap',
  version: '1.0',
  description: 'Generate a prioritized missing-skills learning roadmap with difficulty and timeline',
  cacheTtlSeconds: 86400, // 24 hours — skill priorities change slowly
  estimatedOutputTokens: 900,

  build(ctx: RoadmapContext): AIMessage[] {
    return [
      {
        role: 'system',
        content: `You are a senior engineering manager and technical career advisor. You create realistic, prioritized learning roadmaps. You know which skills are actually required vs nice-to-have, and you give honest time estimates.

Respond with a JSON object in this exact shape:
{
  "summary": "1-2 sentence overview of the skill gap situation",
  "roadmap": [
    {
      "skill": "skill name",
      "priority": 1,
      "category": "language | framework | tool | concept | platform | soft-skill",
      "difficulty": "BEGINNER | INTERMEDIATE | ADVANCED",
      "estimatedWeeks": 2,
      "prerequisite": "skill name or null",
      "why": "why this matters for the target role (1 sentence)",
      "learningPath": ["step 1", "step 2", "step 3"]
    }
  ],
  "suggestedSequence": ["skill in order 1", "skill in order 2"],
  "estimatedTotalWeeks": 12
}

Learning path items should be types of resources (e.g., "Official documentation", "Build a CRUD project", "Complete an online course") — do NOT provide specific URLs.`,
      },
      {
        role: 'user',
        content: `Target role: ${ctx.targetRole}
Weekly hours available for learning: ${ctx.weeklyHoursAvailable}

Current skills: ${ctx.currentSkills.slice(0, 20).join(', ')}

Missing required skills (HIGH priority): ${ctx.missingRequired.join(', ') || 'none'}
Missing preferred skills (MEDIUM priority): ${ctx.missingPreferred.join(', ') || 'none'}

--- JOB REQUIREMENTS CONTEXT ---
${ctx.jobRequirementsContext}

Create a realistic roadmap. Order skills by: (1) blocking dependencies first, (2) highest job impact second, (3) quickest wins third. Group related skills when learning them together makes sense. Be honest about difficulty — do not underestimate. Cap the roadmap at 10 skills max.`,
      },
    ];
  },
};
