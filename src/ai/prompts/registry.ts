// ─── Prompt Registry ──────────────────────────────────────────────────────────
//
// Single import point for all prompt templates.
// The registry enforces unique names at startup.
// When adding a new prompt: create the template file and add it here.

import { improveResumePrompt } from './templates/improve-resume.prompt';
import { roadmapPrompt } from './templates/roadmap.prompt';
import { interviewPrepPrompt } from './templates/interview-prep.prompt';
import { rewriteBulletsPrompt } from './templates/rewrite-bullets.prompt';
import { careerCoachPrompt } from './templates/career-coach.prompt';
import { learningPlanPrompt } from './templates/learning-plan.prompt';
import type { PromptTemplate } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const all: PromptTemplate<any>[] = [
  improveResumePrompt,
  roadmapPrompt,
  interviewPrepPrompt,
  rewriteBulletsPrompt,
  careerCoachPrompt,
  learningPlanPrompt,
];

// Validate uniqueness at module load time (caught in dev, not prod surprises)
const names = new Set<string>();
for (const t of all) {
  if (names.has(t.name)) throw new Error(`Duplicate prompt name: "${t.name}"`);
  names.add(t.name);
}

// Re-export individual templates for typed access
export {
  improveResumePrompt,
  roadmapPrompt,
  interviewPrepPrompt,
  rewriteBulletsPrompt,
  careerCoachPrompt,
  learningPlanPrompt,
};

// Re-export context types for use in feature services
export type { ImproveResumeContext } from './templates/improve-resume.prompt';
export type { RoadmapContext } from './templates/roadmap.prompt';
export type { InterviewPrepContext } from './templates/interview-prep.prompt';
export type { RewriteBulletsContext } from './templates/rewrite-bullets.prompt';
export type { CareerCoachContext } from './templates/career-coach.prompt';
export type { LearningPlanContext } from './templates/learning-plan.prompt';
