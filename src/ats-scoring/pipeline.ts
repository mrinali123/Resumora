// ─── Explainable ATS Scoring Pipeline ────────────────────────────────────────
//
// Public entry point: explain_score(resume, jd) → AtsScoreResult
//
// Overall score = weighted sum of all five component raw scores:
//   skills_match          40%  (most predictive: direct skill alignment)
//   experience_relevance  25%  (second: years + responsibility pattern match)
//   project_strength      15%  (resume depth signal, JD-relevance bonus)
//   formatting_quality    10%  (structure completeness, ATS parse success proxy)
//   impact_metrics        10%  (quantification and action-verb quality)
//
// Every component is computed deterministically from regex, set arithmetic,
// and documented scoring curves — no LLM is called here.
//
// Grading scale:
//   A+  90–100   A   80–89   B+  75–79   B   65–74
//   C   50–64    D   35–49   F   0–34
//
// strengths / improvement_areas are derived from component and sub-score values,
// not generated text, so they remain audit-friendly.

import { scoreSkillsMatch } from './components/skills-match.scorer';
import { scoreExperienceRelevance } from './components/experience-relevance.scorer';
import { scoreProjectStrength } from './components/project-strength.scorer';
import { scoreFormattingQuality } from './components/formatting-quality.scorer';
import { scoreImpactMetrics } from './components/impact-metrics.scorer';
import type { AtsGrade, AtsScoreResult, ComponentScore } from './types';
import type { ResumeJson } from '../jd-matching/types';

// ─── Grade thresholds ─────────────────────────────────────────────────────────

const GRADE_THRESHOLDS: Array<[number, AtsGrade]> = [
  [90, 'A+'],
  [80, 'A'],
  [75, 'B+'],
  [65, 'B'],
  [50, 'C'],
  [35, 'D'],
  [0,  'F'],
];

function computeGrade(score: number): AtsGrade {
  for (const [threshold, grade] of GRADE_THRESHOLDS) {
    if (score >= threshold) return grade;
  }
  return 'F';
}

// ─── Strengths & improvement areas ───────────────────────────────────────────

function deriveStrengths(components: ComponentScore[]): string[] {
  const strengths: string[] = [];

  // Take the top 2 highest-scoring components (raw_score ≥ 65) as strengths
  const sorted = [...components].sort((a, b) => b.raw_score - a.raw_score);

  for (const c of sorted.slice(0, 3)) {
    if (c.raw_score < 65) break;
    // Pull the most positive evidence item for that component
    const topEvidence = c.evidence.find((e) => e.polarity === 'positive');
    const detail = topEvidence ? ` (e.g. ${topEvidence.value})` : '';
    strengths.push(`${c.name} (${c.raw_score}/100)${detail}`);
  }

  if (strengths.length === 0) {
    // Fallback when no component scores ≥ 65
    const best = sorted[0];
    if (best) strengths.push(`${best.name} is the relative strongest area (${best.raw_score}/100)`);
  }

  return strengths.slice(0, 3);
}

function deriveImprovementAreas(components: ComponentScore[]): string[] {
  const areas: string[] = [];

  // Bottom 2-3 components by raw_score
  const sorted = [...components].sort((a, b) => a.raw_score - b.raw_score);

  for (const c of sorted.slice(0, 3)) {
    if (c.raw_score >= 80) break; // only suggest if there's real room to improve

    // Find the first negative evidence item for a concrete suggestion
    const negEvidence = c.evidence.find((e) => e.polarity === 'negative');
    const hint = negEvidence ? ` — ${negEvidence.label}: ${negEvidence.value}` : '';

    // Find the lowest-scoring sub-score for a specific lever
    const lowestSub = [...c.sub_scores].sort((a, b) => a.score - b.score)[0];
    const subHint =
      lowestSub && lowestSub.score < 50
        ? ` (lowest sub-score: ${lowestSub.name} at ${lowestSub.score}/100)`
        : '';

    areas.push(`${c.name} (${c.raw_score}/100)${hint || subHint}`);
  }

  return areas.slice(0, 3);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

function buildSummary(
  overall: number,
  grade: AtsGrade,
  components: ComponentScore[],
): string {
  const byScore = [...components].sort((a, b) => b.raw_score - a.raw_score);
  const topComp = byScore[0];
  const bottomComp = byScore[byScore.length - 1];

  const verdict =
    overall >= 80
      ? 'a strong candidate match'
      : overall >= 65
        ? 'a moderate match with targeted improvements needed'
        : overall >= 50
          ? 'a below-average match with notable gaps'
          : 'a low match requiring significant profile changes';

  return (
    `Overall ATS score: ${overall}/100 (Grade ${grade}) — ${verdict}. ` +
    `Top-scoring area: ${topComp?.name ?? 'n/a'} at ${topComp?.raw_score ?? 0}/100. ` +
    `Primary gap: ${bottomComp?.name ?? 'n/a'} at ${bottomComp?.raw_score ?? 0}/100. ` +
    `Score is computed as a documented weighted sum: 40% skills + 25% experience + 15% projects + 10% formatting + 10% impact metrics.`
  );
}

// ─── Public entry point ───────────────────────────────────────────────────────

export function explain_score(resume: ResumeJson, jd: string): AtsScoreResult {
  // ── Run all five scorers in isolation ─────────────────────────────────────
  // Each scorer is a pure function (or near-pure — no DB, no network)
  const components: ComponentScore[] = [
    scoreSkillsMatch(resume, jd),
    scoreExperienceRelevance(resume, jd),
    scoreProjectStrength(resume, jd),
    scoreFormattingQuality(resume),
    scoreImpactMetrics(resume),
  ];

  // ── Weighted sum (weights are embedded in each ComponentScore) ─────────────
  // overall = Σ(raw_score × weight) — no rounding until the end
  const rawOverall = components.reduce(
    (sum, c) => sum + c.raw_score * c.weight,
    0,
  );
  const overall = Math.max(0, Math.min(100, Math.round(rawOverall)));
  const grade = computeGrade(overall);

  return {
    overall_score: overall,
    grade,
    components,
    strengths: deriveStrengths(components),
    improvement_areas: deriveImprovementAreas(components),
    summary: buildSummary(overall, grade, components),
  };
}
