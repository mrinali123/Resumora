// ─── Resume Version Comparison Pipeline ──────────────────────────────────────
//
// Public entry point: compare_resumes(input) → ResumeComparisonResult
//
// Pipeline steps:
//   1. Skills comparison  — set diff on normalised canonical skill names
//   2. Experience comparison — entry matching + bullet-level change classification
//   3. Projects comparison  — project matching + tech/desc diff
//   4. Certifications comparison — simple set diff
//   5. ATS scoring of both versions (same JD → apples-to-apples component diff)
//   6. Section-level classification — meaningful vs trivial changes + direction
//   7. Recruiter summary — 3-paragraph deterministic narrative
//
// No LLM is called. Every string in the output is assembled from computed values.

import { explain_score } from '../ats-scoring/pipeline';
import { compareSkills } from './comparators/skills.comparator';
import { compareExperience } from './comparators/experience.comparator';
import { compareProjects } from './comparators/projects.comparator';
import {
  classifySkillsSection,
  classifyExperienceSection,
  classifyProjectsSection,
  classifyCertificationsSection,
  applyAtsDeltaThreshold,
} from './analyzers/change-classifier';
import type {
  ResumeComparisonInput,
  ResumeComparisonResult,
  AtsComparison,
  ComponentDelta,
  ImprovedSection,
} from './types';

// ─── ATS comparison helper ────────────────────────────────────────────────────

function runAtsComparison(
  input: ResumeComparisonInput,
): AtsComparison {
  const jd = input.jobDescription ?? '';

  const scoreA = explain_score(input.resumeA, jd);
  const scoreB = explain_score(input.resumeB, jd);

  const componentDeltas: ComponentDelta[] = scoreA.components.map((compA) => {
    const compB = scoreB.components.find((c) => c.component === compA.component)!;
    return {
      component: compA.component,
      name: compA.name,
      score_a: compA.raw_score,
      score_b: compB.raw_score,
      delta: compB.raw_score - compA.raw_score,
    };
  });

  return {
    score_a: scoreA.overall_score,
    score_b: scoreB.overall_score,
    delta: scoreB.overall_score - scoreA.overall_score,
    grade_a: scoreA.grade,
    grade_b: scoreB.grade,
    component_deltas: componentDeltas,
    jd_used: Boolean(input.jobDescription),
  };
}

// ─── Explanation builder ──────────────────────────────────────────────────────

function buildExplanation(
  skillDelta: ReturnType<typeof compareSkills>,
  expDelta: ReturnType<typeof compareExperience>,
  projDelta: ReturnType<typeof compareProjects>,
  ats: AtsComparison,
): string {
  const parts: string[] = [];

  const scorePart =
    ats.delta === 0
      ? `ATS score unchanged at ${ats.score_a}/100 (Grade ${ats.grade_a})`
      : `ATS score ${ats.delta > 0 ? 'improved' : 'declined'} by ${Math.abs(ats.delta)} points: ${ats.score_a} → ${ats.score_b}/100 (${ats.grade_a} → ${ats.grade_b})`;

  parts.push(scorePart + (ats.jd_used ? ' against the provided JD.' : ' (no JD — scores are JD-agnostic).'));

  if (skillDelta.added.length > 0) {
    const jdNote =
      skillDelta.jd_relevant_added.length > 0
        ? `, ${skillDelta.jd_relevant_added.length} of which match the JD (${skillDelta.jd_relevant_added.join(', ')})`
        : '';
    parts.push(`${skillDelta.added.length} skill(s) added${jdNote}.`);
  }
  if (skillDelta.removed.length > 0) {
    parts.push(`${skillDelta.removed.length} skill(s) removed (${skillDelta.removed.join(', ')}).`);
  }

  if (expDelta.new_roles.length > 0) {
    parts.push(`New role(s) added: ${expDelta.new_roles.join(', ')}.`);
  }
  if (expDelta.quantification_improvements > 0) {
    parts.push(`${expDelta.quantification_improvements} experience bullet(s) gained quantified metrics.`);
  }
  if (expDelta.total_bullets_delta > 0) {
    parts.push(`${expDelta.total_bullets_delta} additional bullet point(s) across experience.`);
  }

  if (projDelta.new_projects.length > 0) {
    parts.push(`New project(s) added: ${projDelta.new_projects.join(', ')}.`);
  }

  if (parts.length === 1) {
    parts.push('No meaningful content changes detected between versions.');
  }

  return parts.join(' ');
}

// ─── Recruiter summary ────────────────────────────────────────────────────────

function buildRecruiterSummary(
  result: Omit<ResumeComparisonResult, 'recruiter_summary' | 'explanation'>,
): string {
  const { ats, skill_delta, experience_delta, project_delta, improved_sections } = result;

  // Para 1: Score overview
  const para1 =
    ats.delta > 0
      ? `Version B is a stronger resume. ATS score improved from ${ats.score_a}/100 (${ats.grade_a}) to ${ats.score_b}/100 (${ats.grade_b}) — a ${ats.delta}-point gain${ats.jd_used ? ' against the target role' : ''}.`
      : ats.delta < 0
        ? `Version B is weaker overall. ATS score dropped from ${ats.score_a}/100 (${ats.grade_a}) to ${ats.score_b}/100 (${ats.grade_b}) — a ${Math.abs(ats.delta)}-point regression that should be investigated before submission.`
        : `Version B is equivalent to Version A in ATS score (${ats.score_a}/100, Grade ${ats.grade_a}).`;

  // Para 2: What improved
  const improvements: string[] = [];

  if (skill_delta.jd_relevant_added.length > 0) {
    improvements.push(
      `JD-targeted skills added (${skill_delta.jd_relevant_added.join(', ')})`,
    );
  } else if (skill_delta.added.length > 0) {
    improvements.push(`${skill_delta.added.length} new skill(s)`);
  }

  if (experience_delta.new_roles.length > 0) {
    improvements.push(`new role at ${experience_delta.new_roles.join(', ')}`);
  }
  if (experience_delta.quantification_improvements > 0) {
    improvements.push(
      `${experience_delta.quantification_improvements} bullet(s) now cite measurable results`,
    );
  } else if (experience_delta.total_bullets_delta > 0) {
    improvements.push(`${experience_delta.total_bullets_delta} additional bullet point(s)`);
  }
  if (project_delta.new_projects.length > 0) {
    improvements.push(`new project(s): ${project_delta.new_projects.join(', ')}`);
  }

  const topAtsDelta = [...ats.component_deltas]
    .sort((a, b) => b.delta - a.delta)
    .find((d) => d.delta > 0);
  if (topAtsDelta) {
    improvements.push(
      `${topAtsDelta.name} score up ${topAtsDelta.delta} pts (${topAtsDelta.score_a} → ${topAtsDelta.score_b})`,
    );
  }

  const para2 =
    improvements.length > 0
      ? `What improved: ${improvements.join('; ')}.`
      : 'No clear improvements detected in Version B.';

  // Para 3: What still needs work
  const stillNeeds: string[] = [];

  const worstComponent = [...ats.component_deltas]
    .sort((a, b) => a.score_b - b.score_b)
    .find((d) => d.score_b < 65);

  if (worstComponent) {
    stillNeeds.push(
      `${worstComponent.name} remains low at ${worstComponent.score_b}/100`,
    );
  }

  if (skill_delta.removed.length > skill_delta.added.length) {
    stillNeeds.push(
      `net skill reduction (−${Math.abs(skill_delta.count_delta)} after removals)`,
    );
  }

  const regressions = improved_sections.filter(
    (s) => s.change === 'regressed' && s.is_meaningful,
  );
  for (const r of regressions.slice(0, 2)) {
    stillNeeds.push(`${r.section} section regression: ${r.summary}`);
  }

  const noQuantification =
    experience_delta.quantification_improvements === 0 &&
    experience_delta.total_bullets_a > 0;
  const impactScore = ats.component_deltas.find((d) => d.component === 'impact_metrics')?.score_b ?? 0;
  if (noQuantification && impactScore < 50) {
    stillNeeds.push('experience bullets still lack quantified impact metrics');
  }

  const para3 =
    stillNeeds.length > 0
      ? `Still needs work: ${stillNeeds.join('; ')}.`
      : 'No significant regressions detected. Consider submitting Version B.';

  return [para1, para2, para3].join('\n\n');
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function compare_resumes(
  input: ResumeComparisonInput,
): ResumeComparisonResult {
  const jd = input.jobDescription;

  // ── 1-4: Section comparisons ──────────────────────────────────────────────
  const skillDelta = compareSkills(input.resumeA.skills, input.resumeB.skills, jd);
  const expDelta = compareExperience(input.resumeA.experience, input.resumeB.experience);
  const projDelta = compareProjects(input.resumeA.projects, input.resumeB.projects);

  // ── 5: ATS scoring ────────────────────────────────────────────────────────
  const ats = runAtsComparison(input);

  // ── 6: Section classification ─────────────────────────────────────────────
  const findComponentDelta = (key: string): ComponentDelta | undefined =>
    ats.component_deltas.find((d) => d.component === key);

  const improvedSections: ImprovedSection[] = [
    classifySkillsSection(skillDelta, findComponentDelta('skills_match')),
    classifyExperienceSection(expDelta, findComponentDelta('experience_relevance')),
    classifyProjectsSection(projDelta, findComponentDelta('project_strength')),
    classifyCertificationsSection(input.resumeA, input.resumeB),
  ];

  // Let ATS delta override is_meaningful for any section
  applyAtsDeltaThreshold(improvedSections);

  // ── 7: Derived flags ──────────────────────────────────────────────────────
  const hasRegressions =
    improvedSections.some((s) => s.change === 'regressed' && s.is_meaningful) ||
    ats.delta < -2;

  const isMeaningfulUpgrade =
    ats.delta >= 5 ||
    skillDelta.jd_relevant_added.length > 0 ||
    expDelta.new_roles.length > 0 ||
    expDelta.quantification_improvements >= 2 ||
    projDelta.new_projects.length > 0;

  // ── 8: Build output ───────────────────────────────────────────────────────
  const partial = {
    improvement_score_delta: ats.delta,
    added_skills: skillDelta.added,
    removed_skills: skillDelta.removed,
    improved_sections: improvedSections,
    ats_score_change: ats.delta,
    skill_delta: skillDelta,
    experience_delta: expDelta,
    project_delta: projDelta,
    ats,
    has_regressions: hasRegressions,
    is_meaningful_upgrade: isMeaningfulUpgrade,
  };

  const explanation = buildExplanation(skillDelta, expDelta, projDelta, ats);
  const recruiter_summary = buildRecruiterSummary(partial);

  return {
    ...partial,
    explanation,
    recruiter_summary,
  };
}
