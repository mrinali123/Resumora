// ─── Skill Scorer ─────────────────────────────────────────────────────────────
//
// Computes the skill match score (0–100) from:
//   - Weighted coverage ratio: Σ(matched_weight) / Σ(all_jd_weight)
//   - Core skill penalty: −5 pts per required skill that appears 3+ times and is missing
//     (capped at −20 pts so a single missing niche skill can't crater the score)
//
// "Strong matching skills" = matched skills whose JD weight > 0.70
//   (i.e., appeared in a required section with moderate frequency — truly core)
//
// Missing skills are returned sorted by weight descending so the caller/explainer
// can surface the most critical gaps first.
//
// Normalisation strategy:
//   Resume skills arrive as canonical names from parseResumeSync (normaliseAndDedup).
//   JD skills are canonical TECH_SKILLS names from extractJdSkills.
//   To handle minor casing/punctuation drift, both sides are reduced to a
//   punctuation-free lowercase key before comparison.

import { SKILL_ALIASES } from '../../analysis/skills.constants';
import type { SkillWithWeight, SkillScoreBreakdown } from '../types';

export interface SkillScoreResult {
  score: number;
  matched: string[];         // canonical names matched
  missing: string[];         // sorted by JD weight desc
  strong_matches: string[];  // matched skills with weight > STRONG_THRESHOLD
  breakdown: SkillScoreBreakdown;
}

// Weight above which a matched skill is considered "strong"
const STRONG_MATCH_THRESHOLD = 0.70;

// Per-skill penalty for missing core (required + high-freq) skills
const CORE_PENALTY_PER_SKILL = 5;
const MAX_CORE_PENALTY = 20;

// ─── Normalisation helpers ────────────────────────────────────────────────────

function normKey(s: string): string {
  return s.toLowerCase().replace(/[.\-/\s_]/g, '');
}

// Build a set of normalised keys for fast lookup, including alias expansions
function buildResumeSkillSet(resumeSkills: string[]): Set<string> {
  const set = new Set<string>();
  const aliases = SKILL_ALIASES as Record<string, string>;

  for (const skill of resumeSkills) {
    set.add(normKey(skill));

    // Alias forward: e.g. resume has "js" → aliases to "JavaScript"
    const rawKey = skill.toLowerCase().replace(/[.\-/]/g, '').replace(/\s+/g, ' ');
    const aliased = aliases[rawKey];
    if (aliased) set.add(normKey(aliased));
  }

  return set;
}

// ─── Main scorer ──────────────────────────────────────────────────────────────

export function computeSkillScore(
  resumeSkills: string[],
  jdSkills: SkillWithWeight[],
): SkillScoreResult {
  if (jdSkills.length === 0) {
    return {
      score: 100,
      matched: [],
      missing: [],
      strong_matches: [],
      breakdown: {
        matched_count: 0,
        total_jd_skills: 0,
        weighted_coverage: 1,
        core_penalty: 0,
      },
    };
  }

  const resumeSet = buildResumeSkillSet(resumeSkills);
  const aliases = SKILL_ALIASES as Record<string, string>;

  const matched: SkillWithWeight[] = [];
  const missing: SkillWithWeight[] = [];

  for (const jdSkill of jdSkills) {
    const key = normKey(jdSkill.skill);
    // Also check the alias-resolved form of the JD skill name
    const aliasLookup = jdSkill.skill.toLowerCase().replace(/[.\-/]/g, '').replace(/\s+/g, ' ');
    const aliasedCanonical = aliases[aliasLookup];

    const isMatch =
      resumeSet.has(key) ||
      (aliasedCanonical !== undefined && resumeSet.has(normKey(aliasedCanonical)));

    if (isMatch) {
      matched.push(jdSkill);
    } else {
      missing.push(jdSkill);
    }
  }

  // ── Weighted coverage ─────────────────────────────────────────────────────
  const totalWeight = jdSkills.reduce((s, k) => s + k.weight, 0);
  const matchedWeight = matched.reduce((s, k) => s + k.weight, 0);
  const weightedCoverage = totalWeight > 0 ? matchedWeight / totalWeight : 1;

  // ── Core skill penalty ────────────────────────────────────────────────────
  // "Core" = in a required section AND mentioned ≥ 3 times (clearly non-negotiable)
  const coreMissingCount = missing.filter(
    (s) => s.section === 'required' && s.frequency >= 3,
  ).length;
  const corePenalty = Math.min(MAX_CORE_PENALTY, coreMissingCount * CORE_PENALTY_PER_SKILL);

  const rawScore = weightedCoverage * 100 - corePenalty;
  const score = Math.max(0, Math.min(100, rawScore));

  // ── Strong matches ────────────────────────────────────────────────────────
  const strongMatches = matched
    .filter((s) => s.weight >= STRONG_MATCH_THRESHOLD)
    .map((s) => s.skill);

  // Missing sorted most-critical first
  const missingSorted = [...missing]
    .sort((a, b) => b.weight - a.weight)
    .map((s) => s.skill);

  return {
    score,
    matched: matched.map((s) => s.skill),
    missing: missingSorted,
    strong_matches: strongMatches,
    breakdown: {
      matched_count: matched.length,
      total_jd_skills: jdSkills.length,
      weighted_coverage: parseFloat(weightedCoverage.toFixed(4)),
      core_penalty: corePenalty,
    },
  };
}
