// ─── Project Strength Scorer (15% of overall) ────────────────────────────────
//
// Four sub-scores, each independently computable and explained:
//
//   1. quantity_score     (0.20) — diminishing-returns curve for project count
//   2. tech_breadth       (0.35) — avg tech stack size per project
//   3. description_quality(0.25) — avg description length / quality signal
//   4. jd_relevance       (0.20) — fraction of project tech stacks overlapping
//                                  with JD-identified skills
//
// This scorer is meaningful even without a JD (jd_relevance defaults to
// a neutral 50 when no JD skills are available).
//
// Evidence: one entry per project showing name, tech count, and whether
// a useful description is present.

import { normaliseSkill } from '../../analysis/skills.utils';
import { extractJdSkills } from '../../jd-matching/extractors/jd-skill.extractor';
import type { ResumeJson } from '../../jd-matching/types';
import type { ComponentScore, EvidenceItem, SubScore } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Curve: 0→0, 1→40, 2→65, 3→82, 4→91, 5+→100
function quantityCurve(n: number): number {
  if (n === 0) return 0;
  if (n === 1) return 40;
  if (n === 2) return 65;
  if (n === 3) return 82;
  if (n === 4) return 91;
  return 100;
}

// Curve: 0 tech→0, 1→35, 2→60, 3→78, 4→90, 5+→100
function techBreadthCurve(avg: number): number {
  if (avg <= 0) return 0;
  if (avg < 1.5) return 35;
  if (avg < 2.5) return 60;
  if (avg < 3.5) return 78;
  if (avg < 4.5) return 90;
  return 100;
}

// Score from description length: null/''→0, <30 chars→25, <60→55, <100→75, ≥100→100
function descriptionQualityCurve(desc: string | null): number {
  if (!desc || !desc.trim()) return 0;
  const len = desc.trim().length;
  if (len < 30) return 25;
  if (len < 60) return 55;
  if (len < 100) return 75;
  return 100;
}

// JD relevance: fraction of project tech stacks that include ≥1 JD skill
function computeJdRelevance(
  projects: ResumeJson['projects'],
  jdSkillNames: Set<string>,
): number {
  if (projects.length === 0) return 0;                 // no projects → no relevance
  if (jdSkillNames.size === 0) return 50;              // can't evaluate → neutral

  const relevantCount = projects.filter((p) =>
    p.techStack.some((t) => {
      const norm = t.toLowerCase().replace(/[.\-/\s]/g, '');
      return (
        jdSkillNames.has(norm) ||
        [...jdSkillNames].some(
          (js) => js.includes(norm) || norm.includes(js.slice(0, 4)),
        )
      );
    }),
  ).length;

  return Math.round((relevantCount / projects.length) * 100);
}

// ─── Main scorer ──────────────────────────────────────────────────────────────

export function scoreProjectStrength(resume: ResumeJson, jd: string): ComponentScore {
  const projects = resume.projects;

  // ── Extract JD skill names for relevance check ────────────────────────────
  const jdSkills = extractJdSkills(jd);
  const jdSkillNorms = new Set(
    jdSkills.map((s) => s.skill.toLowerCase().replace(/[.\-/\s]/g, '')),
  );

  // ── Sub-scores ─────────────────────────────────────────────────────────────
  const quantityScore = quantityCurve(projects.length);

  const avgTechSize =
    projects.length > 0
      ? projects.reduce((s, p) => s + p.techStack.length, 0) / projects.length
      : 0;
  const techBreadthScore = techBreadthCurve(avgTechSize);

  const avgDescScore =
    projects.length > 0
      ? projects.reduce((s, p) => s + descriptionQualityCurve(p.description), 0) /
        projects.length
      : 0;
  const descriptionScore = Math.round(avgDescScore);

  const jdRelevanceScore = computeJdRelevance(projects, jdSkillNorms);

  const rawScore =
    quantityScore * 0.20 +
    techBreadthScore * 0.35 +
    descriptionScore * 0.25 +
    jdRelevanceScore * 0.20;

  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  // ── Evidence ──────────────────────────────────────────────────────────────
  const evidence: EvidenceItem[] = [];

  if (projects.length === 0) {
    evidence.push({
      type: 'project_entry',
      label: 'No projects found',
      value: 'Resume has no projects section — add side projects, open source, or academic work',
      source: 'resume',
      polarity: 'negative',
    });
  } else {
    for (const p of projects) {
      const isJdRelevant =
        jdSkillNorms.size > 0 &&
        p.techStack.some((t) => {
          const norm = t.toLowerCase().replace(/[.\-/\s]/g, '');
          return jdSkillNorms.has(norm);
        });

      const techList = p.techStack.length > 0 ? p.techStack.join(', ') : 'no tech listed';
      const descStatus =
        p.description && p.description.length >= 30
          ? 'good description'
          : p.description
            ? 'short description'
            : 'no description';

      evidence.push({
        type: 'project_entry',
        label: isJdRelevant ? 'JD-relevant project' : 'Project',
        value: `${p.name} — ${techList} [${descStatus}]`,
        source: 'resume',
        polarity: isJdRelevant ? 'positive' : 'neutral',
      });
    }
  }

  // ── Sub-score objects ─────────────────────────────────────────────────────
  const subScores: SubScore[] = [
    {
      name: 'Project quantity',
      raw_value: projects.length,
      score: quantityScore,
      weight: 0.20,
      formula: '0→0, 1→40, 2→65, 3→82, 4→91, 5+→100',
    },
    {
      name: 'Tech stack breadth',
      raw_value: parseFloat(avgTechSize.toFixed(1)),
      score: techBreadthScore,
      weight: 0.35,
      formula: 'avg_tech_per_project: 0→0, 1→35, 2→60, 3→78, 4→90, 5+→100',
    },
    {
      name: 'Description quality',
      raw_value: parseFloat(avgDescScore.toFixed(1)),
      score: descriptionScore,
      weight: 0.25,
      formula: 'avg description length: none→0, <30c→25, <60c→55, <100c→75, 100+c→100',
    },
    {
      name: 'JD relevance',
      raw_value: jdSkillNorms.size > 0 ? jdRelevanceScore / 100 : 0,
      score: jdRelevanceScore,
      weight: 0.20,
      formula: 'projects_with_jd_skill / total_projects × 100 (50 if no JD skills detected)',
    },
  ];

  // ── Explanation ───────────────────────────────────────────────────────────
  const quantityText = `${projects.length} project(s) found`;
  const breadthText =
    avgTechSize >= 3
      ? `strong tech breadth (avg ${avgTechSize.toFixed(1)} technologies/project)`
      : avgTechSize >= 1
        ? `moderate tech breadth (avg ${avgTechSize.toFixed(1)} technologies/project)`
        : 'no tech stacks listed in projects';
  const descText =
    descriptionScore >= 60
      ? 'project descriptions are detailed'
      : descriptionScore >= 30
        ? 'project descriptions are brief'
        : 'project descriptions are missing or very short';
  const relevanceText =
    jdSkillNorms.size === 0
      ? 'JD relevance not evaluated (no JD skills detected)'
      : `${jdRelevanceScore}% of projects use JD-relevant technologies`;

  const explanation = `${quantityText}; ${breadthText}. ${descText.charAt(0).toUpperCase() + descText.slice(1)}. ${relevanceText.charAt(0).toUpperCase() + relevanceText.slice(1)}.`;

  return {
    component: 'project_strength',
    name: 'Project Strength',
    weight: 0.15,
    raw_score: score,
    weighted_score: parseFloat((score * 0.15).toFixed(1)),
    explanation,
    evidence,
    sub_scores: subScores,
  };
}
