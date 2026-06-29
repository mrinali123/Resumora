// ─── Skills Comparator ───────────────────────────────────────────────────────
//
// Set-difference comparison on normalised canonical skill names.
// Normalisation reuses the parser normalizer so "React.js", "reactjs",
// and "React" all collapse to "React" before the diff is computed.
//
// JD-relevance: if a JD is supplied, added skills are further partitioned
// into those that appear in the JD (high-signal improvement) vs those that
// don't (nice-to-have, but may not help with target role).

import { normaliseAndDedup } from '../../parser/normalizers/skill.normalizer';
import { extractJdSkills } from '../../jd-matching/extractors/jd-skill.extractor';
import type { SkillDelta } from '../types';

// Strips punctuation and whitespace for equality comparison
function normKey(s: string): string {
  return s.toLowerCase().replace(/[.\-/\s_]/g, '');
}

export function compareSkills(
  skillsA: string[],
  skillsB: string[],
  jd?: string,
): SkillDelta {
  const normA = normaliseAndDedup(skillsA);
  const normB = normaliseAndDedup(skillsB);

  const setA = new Map(normA.map((s) => [normKey(s), s]));
  const setB = new Map(normB.map((s) => [normKey(s), s]));

  const added = normB.filter((s) => !setA.has(normKey(s)));
  const removed = normA.filter((s) => !setB.has(normKey(s)));
  const retained = normA.filter((s) => setB.has(normKey(s)));

  // JD-relevant added: skills in B that also appear in the JD requirements
  let jdRelevantAdded: string[] = [];
  if (jd && added.length > 0) {
    const jdSkillNorms = new Set(
      extractJdSkills(jd).map((s) => normKey(s.skill)),
    );
    jdRelevantAdded = added.filter((s) => jdSkillNorms.has(normKey(s)));
  }

  return {
    added,
    removed,
    retained,
    count_delta: normB.length - normA.length,
    jd_relevant_added: jdRelevantAdded,
  };
}
