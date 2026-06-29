// ─── Score Explainer ──────────────────────────────────────────────────────────
//
// Converts computed scores into a human-readable explanation string.
// This is entirely deterministic — no LLM calls.
//
// Structure of the output string (one sentence per topic):
//   1. Skill coverage: matched vs total, top strong matches, top missing
//   2. Core penalty callout (if any)
//   3. Experience: years comparison, responsibility alignment quality
//   4. Semantic similarity method + score
//   5. Overall verdict with qualitative label

import type { SkillScoreResult } from '../scorers/skill.scorer';
import type { ExperienceScoreResult } from '../scorers/experience.scorer';
import type { SemanticScoreResult } from '../scorers/semantic.scorer';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreLabel(score: number): 'strong' | 'moderate' | 'weak' | 'low' {
  if (score >= 80) return 'strong';
  if (score >= 60) return 'moderate';
  if (score >= 40) return 'weak';
  return 'low';
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function joinList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

// ─── Main builder ─────────────────────────────────────────────────────────────

export function buildExplanation(params: {
  overall: number;
  skillResult: SkillScoreResult;
  expResult: ExperienceScoreResult;
  semResult: SemanticScoreResult;
}): string {
  const { overall, skillResult, expResult, semResult } = params;
  const sb = skillResult.breakdown;
  const eb = expResult.breakdown;

  const sentences: string[] = [];

  // ── Skills section ─────────────────────────────────────────────────────────

  if (sb.total_jd_skills === 0) {
    sentences.push(
      'No specific technology skills were identified in the job description.',
    );
  } else {
    const covPct = Math.round(sb.weighted_coverage * 100);
    sentences.push(
      `Skills: matched ${sb.matched_count} of ${plural(sb.total_jd_skills, 'identified skill')} ` +
        `(${covPct}% weighted coverage).`,
    );

    if (skillResult.strong_matches.length > 0) {
      const top3 = skillResult.strong_matches.slice(0, 3);
      sentences.push(`Top strengths: ${joinList(top3)}.`);
    }

    if (skillResult.missing.length > 0) {
      const top3 = skillResult.missing.slice(0, 3);
      sentences.push(`Missing high-priority skills: ${joinList(top3)}.`);
    }

    if (sb.core_penalty > 0) {
      const coreCount = sb.core_penalty / 5;
      sentences.push(
        `Score reduced by ${sb.core_penalty} points: ` +
          `${plural(coreCount, 'core required skill')} appear${coreCount === 1 ? 's' : ''} ` +
          `3+ times in the job description but are absent from the resume.`,
      );
    }
  }

  // ── Experience section ─────────────────────────────────────────────────────

  if (eb.years_required !== null && eb.years_candidate !== null) {
    const meets = eb.years_candidate >= eb.years_required;
    sentences.push(
      `Experience: ~${eb.years_candidate} year(s) estimated vs ${eb.years_required}+ year(s) required — ` +
        (meets ? 'requirement met.' : 'below the stated minimum.'),
    );
  } else if (eb.years_required !== null) {
    sentences.push(
      `Experience: role requires ${eb.years_required}+ years; ` +
        `candidate experience could not be estimated from resume dates.`,
    );
  } else {
    sentences.push('Experience: no minimum years specified in the job description.');
  }

  if (eb.responsibility_overlap_score >= 60) {
    sentences.push(
      'Resume bullet points show strong alignment with the job responsibilities.',
    );
  } else if (eb.responsibility_overlap_score >= 35) {
    sentences.push(
      'Partial overlap between resume experience and job responsibilities; ' +
        'consider tailoring bullet points to mirror key JD phrases.',
    );
  } else {
    sentences.push(
      'Limited overlap between resume bullet points and job responsibilities — ' +
        'tailoring the experience section to match JD language would improve this score.',
    );
  }

  // ── Semantic section ───────────────────────────────────────────────────────

  if (semResult.breakdown.method === 'embedding') {
    sentences.push(
      `Semantic similarity (embedding-based): ${semResult.score}/100.`,
    );
  } else {
    sentences.push(
      `Document similarity (keyword overlap): ${semResult.score}/100.`,
    );
  }

  // ── Overall verdict ────────────────────────────────────────────────────────

  const label = scoreLabel(overall);
  const roundedOverall = Math.round(overall);

  const recommendation =
    label === 'strong'
      ? 'This resume is a strong fit — consider applying.'
      : label === 'moderate'
        ? 'A moderate fit — tailoring key sections would increase the match score.'
        : label === 'weak'
          ? 'A weak match — significant gaps in skills or experience remain.'
          : 'A low match — this role may require substantial additional skills or experience.';

  sentences.push(`Overall: ${roundedOverall}/100. ${recommendation}`);

  return sentences.join(' ');
}
