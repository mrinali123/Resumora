// ─── Skills Match Scorer (40% of overall) ────────────────────────────────────
//
// Formula:
//   raw_score = weighted_coverage × 100 − core_penalty
//
// where:
//   weighted_coverage = Σ(matched_skill.weight) / Σ(all_jd_skill.weight)
//   core_penalty      = min(20, count_of_missing_required_skills_freq≥3 × 5)
//
// Sub-scores:
//   1. weighted_coverage   (0.70 weight) — quality-adjusted fraction of JD skills matched
//   2. required_coverage   (0.30 weight) — fraction of "required" section skills matched
//      (biases the score toward the skills explicitly labelled as requirements)
//
// Evidence:
//   + matched_skill: every skill in resume that also appears in JD (positive)
//   − missing_skill: top 8 unmatched JD skills by weight (negative)

import { extractJdSkills } from '../../jd-matching/extractors/jd-skill.extractor';
import { computeSkillScore } from '../../jd-matching/scorers/skill.scorer';
import { normaliseAndDedup } from '../../parser/normalizers/skill.normalizer';
import type { ResumeJson } from '../../jd-matching/types';
import type { ComponentScore, EvidenceItem, SubScore } from '../types';

export function scoreSkillsMatch(resume: ResumeJson, jd: string): ComponentScore {
  const jdSkills = extractJdSkills(jd);
  const normalisedResumeSkills = normaliseAndDedup(resume.skills);
  const result = computeSkillScore(normalisedResumeSkills, jdSkills);

  const { matched_count, total_jd_skills, weighted_coverage, core_penalty } = result.breakdown;

  // ── Sub-score 1: weighted coverage ────────────────────────────────────────
  const weightedCoverageScore = Math.round(Math.min(100, weighted_coverage * 100));

  // ── Sub-score 2: required-section coverage ────────────────────────────────
  const requiredSkills = jdSkills.filter((s) => s.section === 'required');
  const requiredMatched = result.matched.filter((m) =>
    requiredSkills.some((rs) => rs.skill.toLowerCase() === m.toLowerCase()),
  ).length;
  const requiredCoverageScore =
    requiredSkills.length > 0
      ? Math.round((requiredMatched / requiredSkills.length) * 100)
      : 100;

  const rawScore = Math.max(
    0,
    Math.min(100, weightedCoverageScore * 0.70 + requiredCoverageScore * 0.30 - core_penalty),
  );

  // ── Evidence ──────────────────────────────────────────────────────────────
  const evidence: EvidenceItem[] = [];

  // Positive: all matched skills
  for (const skill of result.matched) {
    evidence.push({
      type: 'matched_skill',
      label: 'Matched skill',
      value: skill,
      source: 'both',
      polarity: 'positive',
    });
  }

  // Negative: top 8 missing by JD weight
  for (const skill of result.missing.slice(0, 8)) {
    const jdEntry = jdSkills.find((s) => s.skill === skill);
    const section = jdEntry?.section ?? 'general';
    const freq = jdEntry?.frequency ?? 1;
    evidence.push({
      type: 'missing_skill',
      label: `Missing ${section} skill`,
      value: `${skill} (mentioned ${freq}× in JD)`,
      source: 'jd',
      polarity: 'negative',
    });
  }

  // ── Sub-scores ────────────────────────────────────────────────────────────
  const subScores: SubScore[] = [
    {
      name: 'Weighted skill coverage',
      raw_value: parseFloat(weighted_coverage.toFixed(3)),
      score: weightedCoverageScore,
      weight: 0.70,
      formula: 'Σ(matched_weight) / Σ(all_jd_weight) × 100',
    },
    {
      name: 'Required-section coverage',
      raw_value: requiredSkills.length > 0 ? requiredMatched / requiredSkills.length : 1,
      score: requiredCoverageScore,
      weight: 0.30,
      formula: 'required_matched / total_required × 100',
    },
  ];

  // ── Explanation ───────────────────────────────────────────────────────────
  const covPct = Math.round(weighted_coverage * 100);
  const missingLabel =
    result.missing.length > 0
      ? ` Missing critical skills: ${result.missing.slice(0, 3).join(', ')}.`
      : ' All identified JD skills are covered.';

  const penaltyLabel =
    core_penalty > 0
      ? ` Score reduced by ${core_penalty} pts: ${core_penalty / 5} high-frequency required skill(s) absent.`
      : '';

  const explanation =
    total_jd_skills === 0
      ? 'No specific technology skills were identified in the job description; full score awarded by default.'
      : `Matched ${matched_count} of ${total_jd_skills} JD skills with ${covPct}% weighted coverage.` +
        (requiredSkills.length > 0
          ? ` Required-section coverage: ${requiredMatched}/${requiredSkills.length}.`
          : '') +
        missingLabel +
        penaltyLabel;

  return {
    component: 'skills_match',
    name: 'Skills Match',
    weight: 0.40,
    raw_score: parseFloat(rawScore.toFixed(1)),
    weighted_score: parseFloat((rawScore * 0.40).toFixed(1)),
    explanation,
    evidence,
    sub_scores: subScores,
  };
}
