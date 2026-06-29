// ─── Skills Utilities ─────────────────────────────────────────────────────────
//
// Pure functions shared across the analysis layer.
// No DB access, no side effects — easy to unit-test.

import { TECH_SKILLS, SKILL_ALIASES } from './skills.constants';

// ─── Normalisation ────────────────────────────────────────────────────────────

// Converts a skill name to a canonical comparable form.
//   "Node.js"  → "nodejs"
//   "React.js" → "reactjs"   (then alias resolves to "React")
//   "C++"      → "c++"
//   "scikit-learn" → "scikitlearn"
export function normaliseSkill(skill: string): string {
  return skill
    .toLowerCase()
    .replace(/\s+/g, '')    // collapse whitespace
    .replace(/[.\-_]/g, ''); // remove punctuation
}

// Resolves a raw skill string to the canonical TECH_SKILLS name if one exists.
// Falls back to the original with trimmed casing if no alias is found.
export function resolveSkill(raw: string): string {
  const normalised = normaliseSkill(raw);
  return SKILL_ALIASES[normalised] ?? raw.trim();
}

// ─── Skill extraction ─────────────────────────────────────────────────────────

// Scans freeform text for occurrences of known tech skills.
// Returns canonical skill names (de-duplicated, preserving first occurrence order).
export function extractSkillsFromText(text: string): string[] {
  if (!text) return [];

  const found = new Map<string, string>(); // normalised → canonical

  for (const skill of TECH_SKILLS) {
    const normalised = normaliseSkill(skill);
    if (found.has(normalised)) continue;

    // Word-boundary regex: prevents "Go" matching "Golang" or "ago"
    // \b works for most skills; special-case skills with non-word chars (C++, C#)
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const boundary = /[+#]$/.test(skill) ? '' : '\\b';
    const pattern = new RegExp(`(?<![a-z])${escaped}${boundary}`, 'i');

    if (pattern.test(text)) {
      found.set(normalised, skill);
    }
  }

  return [...found.values()];
}

// ─── Skill matching ───────────────────────────────────────────────────────────

// Returns the subset of `targets` that have an exact normalised match in `pool`.
export function findExactMatches(pool: string[], targets: string[]): string[] {
  const normalisedPool = new Set(pool.map(normaliseSkill));
  return targets.filter((t) => {
    const n = normaliseSkill(t);
    // Also check alias resolution
    const aliased = SKILL_ALIASES[n];
    return normalisedPool.has(n) || (aliased && normalisedPool.has(normaliseSkill(aliased)));
  });
}

// ─── Education level detection ────────────────────────────────────────────────

const EDU_PATTERNS = {
  phd: /\b(ph\.?d|doctorate|doctoral|d\.?phil|doctor\s+of\s+philosophy|doctor\s+of\s+science)\b/i,
  masters: /\b(master(?:s)?|m\.?s\.?|m\.?eng\.?|m\.?sc\.?|mba)\b/i,
  bachelors: /\b(bachelor(?:s)?|b\.?s\.?|b\.?e\.?|b\.?eng\.?|b\.?sc\.?|undergraduate)\b/i,
  associate: /\b(associate(?:s)?|a\.?a\.?|a\.?s\.?)\b/i,
};

export function detectEducationLevel(
  text: string,
): 'phd' | 'masters' | 'bachelors' | 'associate' | 'none' {
  if (EDU_PATTERNS.phd.test(text)) return 'phd';
  if (EDU_PATTERNS.masters.test(text)) return 'masters';
  if (EDU_PATTERNS.bachelors.test(text)) return 'bachelors';
  if (EDU_PATTERNS.associate.test(text)) return 'associate';
  return 'none';
}

// ─── Vector math ──────────────────────────────────────────────────────────────

// OpenAI embeddings are L2-normalised unit vectors, so cosine_similarity = dot_product.
// This is significantly faster than computing norms separately.
export function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

// Parses a pgvector text representation '[0.1,0.2,...]' back to number[].
// Used after `SELECT embedding::text FROM resume_chunks ...`
export function parseVectorString(s: string): number[] {
  // pgvector format: [v1,v2,...,vn] — strip brackets, split on comma
  const inner = s.slice(1, -1).trim();
  if (!inner) return [];
  return inner.split(',').map(Number);
}

// ─── Score utilities ──────────────────────────────────────────────────────────

// Clamps a score to [0, 100] and rounds to 2 decimal places.
export function clampScore(score: number): number {
  return Math.min(100, Math.max(0, Math.round(score * 100) / 100));
}

// Returns the top-K values from an array of numbers (highest first).
export function topK(values: number[], k: number): number[] {
  return [...values].sort((a, b) => b - a).slice(0, k);
}

// Weighted mean of top-K similarity scores.
// Gives highest weight to the best match, linearly decreasing:
//   e.g. for K=3: weights are [0.5, 0.33, 0.17]
// Why weighted instead of simple mean?
//   A candidate with one exceptional matching role + two unrelated jobs
//   should score higher than a candidate with three mediocre matches.
export function weightedTopKMean(scores: number[], k: number): number {
  const top = topK(scores, k);
  if (top.length === 0) return 0;

  const weights = top.map((_, i) => 1 / (i + 1));
  const weightSum = weights.reduce((s, w) => s + w, 0);
  const weightedSum = top.reduce((s, score, i) => s + score * weights[i], 0);

  return weightedSum / weightSum;
}
