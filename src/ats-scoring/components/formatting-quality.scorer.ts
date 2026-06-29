// ─── Formatting Quality Scorer (10% of overall) ──────────────────────────────
//
// An 11-item weighted checklist totalling exactly 100 points.
// No JD is needed — this measures how complete and well-structured the parsed
// resume is, which strongly correlates with ATS parse success.
//
// Each check is:
//   - binary: the criterion is either met or not (no partial credit per item)
//   - documented with the points at stake
//   - included in the evidence array so the UI can render a pass/fail checklist
//
// Checklist (points sum to 100):
//   has_email               12   Contact completeness
//   has_phone                6   Contact completeness
//   has_skills_basic        14   Skills section present (≥ 3 skills)
//   has_skills_deep          8   Skills section rich (≥ 8 skills)
//   has_experience          14   At least one experience entry
//   experience_has_roles     6   All experience entries have job title
//   experience_has_dates     6   All experience entries have duration
//   experience_has_bullets  12   At least one experience entry has bullet points
//   has_education           10   At least one education entry
//   education_has_detail     6   Education entry has degree + both years
//   has_projects             6   At least one project entry

import type { ResumeJson } from '../../jd-matching/types';
import type { ComponentScore, EvidenceItem, SubScore } from '../types';

// ─── Checklist definition ─────────────────────────────────────────────────────

interface CheckItem {
  id: string;
  label: string;
  points: number;
  evaluate: (r: ResumeJson) => boolean;
}

const CHECKS: CheckItem[] = [
  {
    id: 'has_email',
    label: 'Email address present',
    points: 12,
    evaluate: (r) => Boolean(r.email),
  },
  {
    id: 'has_phone',
    label: 'Phone number present',
    points: 6,
    evaluate: (r) => Boolean(r.phone),
  },
  {
    id: 'has_skills_basic',
    label: 'Skills section present (≥3 skills)',
    points: 14,
    evaluate: (r) => r.skills.length >= 3,
  },
  {
    id: 'has_skills_deep',
    label: 'Skills section rich (≥8 skills)',
    points: 8,
    evaluate: (r) => r.skills.length >= 8,
  },
  {
    id: 'has_experience',
    label: 'Experience section present (≥1 entry)',
    points: 14,
    evaluate: (r) => r.experience.length >= 1,
  },
  {
    id: 'experience_has_roles',
    label: 'All experience entries have a job title',
    points: 6,
    evaluate: (r) =>
      r.experience.length > 0 && r.experience.every((e) => Boolean(e.role)),
  },
  {
    id: 'experience_has_dates',
    label: 'All experience entries have duration/dates',
    points: 6,
    evaluate: (r) =>
      r.experience.length > 0 && r.experience.every((e) => Boolean(e.duration)),
  },
  {
    id: 'experience_has_bullets',
    label: 'Experience entries use bullet points',
    points: 12,
    evaluate: (r) =>
      r.experience.length > 0 &&
      r.experience.some((e) => e.bulletPoints.length >= 2),
  },
  {
    id: 'has_education',
    label: 'Education section present (≥1 entry)',
    points: 10,
    evaluate: (r) => r.education.length >= 1,
  },
  {
    id: 'education_has_detail',
    label: 'Education entry has degree and both years',
    points: 6,
    evaluate: (r) =>
      r.education.length > 0 &&
      Boolean(r.education[0].degree) &&
      Boolean(r.education[0].startYear) &&
      Boolean(r.education[0].endYear),
  },
  {
    id: 'has_projects',
    label: 'Projects section present (≥1 entry)',
    points: 6,
    evaluate: (r) => r.projects.length >= 1,
  },
];

// Sanity: ensure points sum to 100
const TOTAL_POINTS = CHECKS.reduce((s, c) => s + c.points, 0);
if (TOTAL_POINTS !== 100) {
  // Caught at module load time during development
  throw new Error(`Formatting checklist points must sum to 100, got ${TOTAL_POINTS}`);
}

// ─── Main scorer ──────────────────────────────────────────────────────────────

export function scoreFormattingQuality(resume: ResumeJson): ComponentScore {
  let earned = 0;
  const results: Array<CheckItem & { passed: boolean }> = [];

  for (const check of CHECKS) {
    const passed = check.evaluate(resume);
    if (passed) earned += check.points;
    results.push({ ...check, passed });
  }

  const rawScore = earned; // already 0–100

  // ── Evidence ──────────────────────────────────────────────────────────────
  const evidence: EvidenceItem[] = results.map((r) => ({
    type: 'format_check' as const,
    label: r.passed ? `✓ ${r.label}` : `✗ ${r.label}`,
    value: `${r.passed ? '+' : '−'}${r.points} pts`,
    source: 'resume' as const,
    polarity: r.passed ? 'positive' as const : 'negative' as const,
  }));

  // ── Sub-scores (grouped) ──────────────────────────────────────────────────
  const contactPts = results
    .filter((r) => r.id.startsWith('has_email') || r.id.startsWith('has_phone'))
    .reduce((s, r) => s + (r.passed ? r.points : 0), 0);
  const contactMax = 12 + 6;

  const skillsPts = results
    .filter((r) => r.id.startsWith('has_skills'))
    .reduce((s, r) => s + (r.passed ? r.points : 0), 0);
  const skillsMax = 14 + 8;

  const experiencePts = results
    .filter((r) => r.id.startsWith('has_experience') || r.id.startsWith('experience'))
    .reduce((s, r) => s + (r.passed ? r.points : 0), 0);
  const experienceMax = 14 + 6 + 6 + 12;

  const educationPts = results
    .filter((r) => r.id.startsWith('has_education') || r.id.startsWith('education'))
    .reduce((s, r) => s + (r.passed ? r.points : 0), 0);
  const educationMax = 10 + 6;

  const projectsPts = results
    .filter((r) => r.id.startsWith('has_projects'))
    .reduce((s, r) => s + (r.passed ? r.points : 0), 0);
  const projectsMax = 6;

  const subScores: SubScore[] = [
    {
      name: 'Contact completeness',
      raw_value: contactPts,
      score: Math.round((contactPts / contactMax) * 100),
      weight: contactMax / 100,
      formula: `earned ${contactPts}/${contactMax} pts from email + phone checks`,
    },
    {
      name: 'Skills section quality',
      raw_value: skillsPts,
      score: Math.round((skillsPts / skillsMax) * 100),
      weight: skillsMax / 100,
      formula: `earned ${skillsPts}/${skillsMax} pts from skills count checks`,
    },
    {
      name: 'Experience section quality',
      raw_value: experiencePts,
      score: Math.round((experiencePts / experienceMax) * 100),
      weight: experienceMax / 100,
      formula: `earned ${experiencePts}/${experienceMax} pts from experience checks`,
    },
    {
      name: 'Education section quality',
      raw_value: educationPts,
      score: Math.round((educationPts / educationMax) * 100),
      weight: educationMax / 100,
      formula: `earned ${educationPts}/${educationMax} pts from education checks`,
    },
    {
      name: 'Projects section present',
      raw_value: projectsPts,
      score: Math.round((projectsPts / projectsMax) * 100),
      weight: projectsMax / 100,
      formula: `earned ${projectsPts}/${projectsMax} pts (projects section present)`,
    },
  ];

  // ── Explanation ───────────────────────────────────────────────────────────
  const failing = results.filter((r) => !r.passed);
  const failLabels = failing.map((r) => r.label);

  const explanation =
    rawScore === 100
      ? 'Resume structure is complete: all 11 formatting criteria are met.'
      : rawScore >= 80
        ? `Well-structured resume (${earned}/100 pts). Missing: ${failLabels.join('; ')}.`
        : rawScore >= 60
          ? `Moderate structure (${earned}/100 pts). Improve: ${failLabels.slice(0, 3).join('; ')}.`
          : `Structural gaps detected (${earned}/100 pts). Critical missing: ${failLabels.slice(0, 4).join('; ')}.`;

  return {
    component: 'formatting_quality',
    name: 'Resume Formatting Quality',
    weight: 0.10,
    raw_score: rawScore,
    weighted_score: parseFloat((rawScore * 0.10).toFixed(1)),
    explanation,
    evidence,
    sub_scores: subScores,
  };
}
