// ─── JD Match Pipeline ────────────────────────────────────────────────────────
//
// Stateless orchestrator. Takes a resume JSON + raw JD text and returns a
// structured JdMatchResult without any database access.
//
// Scoring weights (must sum to 1.0):
//   skills      0.45 — highest weight: direct tech skill alignment is the
//                       strongest predictor of ATS pass-through.
//   experience  0.35 — second: years + responsibility overlap captures seniority
//                       and role relevance beyond a skills keyword list.
//   semantic    0.20 — weakest: holistic document similarity as a sanity-check
//                       signal (embedding-based when vectors are supplied,
//                       otherwise extended Jaccard).

import { normaliseAndDedup } from '../parser/normalizers/skill.normalizer';
import { clampScore } from '../analysis/skills.utils';
import { extractJdSkills } from './extractors/jd-skill.extractor';
import { computeSkillScore } from './scorers/skill.scorer';
import { computeExperienceScore } from './scorers/experience.scorer';
import { computeSemanticScore } from './scorers/semantic.scorer';
import { buildExplanation } from './explainer/score.explainer';
import type { JdMatchInput, JdMatchResult } from './types';

export const MATCH_WEIGHTS = {
  skills: 0.45,
  experience: 0.35,
  semantic: 0.20,
} as const;

export function matchResumeToJob(input: JdMatchInput): JdMatchResult {
  const { resume, jobDescription, resumeEmbedding, jdEmbedding } = input;

  // ── 1. Extract JD skills ──────────────────────────────────────────────────
  // Multi-pass NLP: section detection → skill scanning → frequency weighting
  const jdSkills = extractJdSkills(jobDescription);

  // ── 2. Normalise resume skills ────────────────────────────────────────────
  // Reuses the same normaliser as the parser so aliases resolve consistently
  // (e.g. "React.js", "reactjs", "React" all → "React")
  const normalisedResumeSkills = normaliseAndDedup(resume.skills);

  // ── 3. Component scores ───────────────────────────────────────────────────
  const skillResult = computeSkillScore(normalisedResumeSkills, jdSkills);
  const expResult = computeExperienceScore(resume, jobDescription);
  const semResult = computeSemanticScore(
    resume,
    jobDescription,
    resumeEmbedding,
    jdEmbedding,
  );

  // ── 4. Weighted composite ─────────────────────────────────────────────────
  const rawOverall =
    skillResult.score * MATCH_WEIGHTS.skills +
    expResult.score * MATCH_WEIGHTS.experience +
    semResult.score * MATCH_WEIGHTS.semantic;

  const overall = clampScore(rawOverall);

  // ── 5. Deterministic explanation ──────────────────────────────────────────
  const explanation = buildExplanation({ overall, skillResult, expResult, semResult });

  return {
    overall_match_score: Math.round(overall),
    skill_match_score: Math.round(skillResult.score),
    experience_match_score: Math.round(expResult.score),
    missing_skills: skillResult.missing,
    strong_matching_skills: skillResult.strong_matches,
    semantic_similarity_score: Math.round(semResult.score),
    explanation,
    _breakdown: {
      skill_detail: skillResult.breakdown,
      experience_detail: expResult.breakdown,
      semantic_detail: semResult.breakdown,
      weights_used: { ...MATCH_WEIGHTS },
    },
  };
}
