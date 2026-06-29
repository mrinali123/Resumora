// Red flag rules — each returns a RedFlag if the condition is met, null otherwise.
// Ordered by severity: CRITICAL → HIGH → MEDIUM → LOW.
// The pipeline runs all rules and sorts by severity before display.

import type { RedFlag, RecruiterContext } from '../types';

type RuleFunction = (ctx: RecruiterContext) => RedFlag | null;

// ─── CRITICAL ─────────────────────────────────────────────────────────────────
// Hard blockers: any single CRITICAL flag caps probability at 28.

function noWorkEvidence(ctx: RecruiterContext): RedFlag | null {
  if (ctx.resume.experience.length > 0 || ctx.resume.projects.length > 0) return null;
  return {
    severity: 'CRITICAL',
    category: 'no_work_evidence',
    description: 'No work experience or projects listed — cannot evaluate candidate',
    evidence: 'Experience and Projects sections are both empty',
  };
}

function criticalSkillGap(ctx: RecruiterContext): RedFlag | null {
  if (!ctx.hasJd || ctx.skillScore >= 30) return null;
  const sample = ctx.missingSkills.slice(0, 3).join(', ');
  return {
    severity: 'CRITICAL',
    category: 'critical_skill_gap',
    description: 'Critical skill gap — under 30% of required skills covered',
    evidence: sample ? `Missing: ${sample}` : `Skill match score: ${ctx.skillScore}/100`,
  };
}

function zeroSkillsListed(ctx: RecruiterContext): RedFlag | null {
  if (ctx.resume.skills.length > 0) return null;
  return {
    severity: 'CRITICAL',
    category: 'zero_skills',
    description: 'No technical skills listed — minimum bar for technical screening not met',
    evidence: 'Skills section is absent or empty',
  };
}

// ─── HIGH ─────────────────────────────────────────────────────────────────────

function zeroQuantifiedImpact(ctx: RecruiterContext): RedFlag | null {
  const expBullets = ctx.resume.experience.flatMap((e) => e.bulletPoints);
  if (expBullets.length < 3) return null; // too few bullets to evaluate
  if (ctx.metricDensity > 0) return null;
  return {
    severity: 'HIGH',
    category: 'zero_quantified_impact',
    description: 'No quantified achievements in any experience bullet',
    evidence: `${expBullets.length} bullet(s) — zero contain numeric evidence of impact`,
  };
}

function experienceShortfall(ctx: RecruiterContext): RedFlag | null {
  if (!ctx.hasJd || ctx.yearsRequired === null) return null;
  if (ctx.yearsCandidate >= ctx.yearsRequired * 0.67) return null;
  return {
    severity: 'HIGH',
    category: 'experience_shortfall',
    description: 'Significant experience gap relative to stated requirements',
    evidence: `~${ctx.yearsCandidate} yr estimated vs ${ctx.yearsRequired}+ yr required`,
  };
}

function noPortfolio(ctx: RecruiterContext): RedFlag | null {
  if (ctx.resume.projects.length > 0) return null;
  if (ctx.impactScore >= 45) return null; // strong experience compensates
  return {
    severity: 'HIGH',
    category: 'no_projects',
    description: 'No portfolio or project work — technical depth cannot be independently verified',
    evidence: 'Projects section is empty',
  };
}

function weakActionVerbs(ctx: RecruiterContext): RedFlag | null {
  const expBullets = ctx.resume.experience.flatMap((e) => e.bulletPoints);
  if (expBullets.length < 4) return null;
  if (ctx.actionVerbDensity >= 0.20) return null;
  return {
    severity: 'HIGH',
    category: 'weak_action_verbs',
    description: 'Experience bullets lack professional action verbs — hard to assess individual contribution',
    evidence: `${Math.round(ctx.actionVerbDensity * 100)}% of bullets start with a strong action verb`,
  };
}

function substantialSkillGap(ctx: RecruiterContext): RedFlag | null {
  if (!ctx.hasJd || ctx.skillScore < 30 || ctx.skillScore >= 45) return null;
  return {
    severity: 'HIGH',
    category: 'substantial_skill_gap',
    description: 'Substantial skill gaps — under half of key requirements covered',
    evidence: `Skill match: ${ctx.skillScore}/100. Missing: ${ctx.missingSkills.slice(0, 4).join(', ')}`,
  };
}

// ─── MEDIUM ───────────────────────────────────────────────────────────────────

function missingEmail(ctx: RecruiterContext): RedFlag | null {
  if (ctx.resume.email) return null;
  return {
    severity: 'MEDIUM',
    category: 'missing_email',
    description: 'No email address — candidate is unreachable for follow-up',
    evidence: 'Email field absent from resume',
  };
}

function sparseSkills(ctx: RecruiterContext): RedFlag | null {
  const count = ctx.resume.skills.length;
  if (count === 0 || count >= 5) return null;
  return {
    severity: 'MEDIUM',
    category: 'sparse_skills',
    description: 'Skill section appears thin — fewer than 5 technologies listed',
    evidence: `${count} skill(s): ${ctx.resume.skills.join(', ')}`,
  };
}

function moderateSkillGap(ctx: RecruiterContext): RedFlag | null {
  if (!ctx.hasJd || ctx.skillScore < 45 || ctx.skillScore >= 60) return null;
  return {
    severity: 'MEDIUM',
    category: 'moderate_skill_gap',
    description: 'Moderate skill gaps — role may require upskilling in several areas',
    evidence: `Coverage: ${ctx.skillScore}/100. Missing: ${ctx.missingSkills.slice(0, 3).join(', ')}`,
  };
}

function lowQuantification(ctx: RecruiterContext): RedFlag | null {
  const expBullets = ctx.resume.experience.flatMap((e) => e.bulletPoints);
  if (expBullets.length < 3) return null;
  // zeroQuantifiedImpact already covers metricDensity === 0
  if (ctx.metricDensity === 0 || ctx.metricDensity >= 0.15) return null;
  return {
    severity: 'MEDIUM',
    category: 'low_quantification',
    description: 'Few quantified results — scale of impact is difficult to gauge',
    evidence: `${Math.round(ctx.metricDensity * 100)}% of bullets contain measurable evidence`,
  };
}

// ─── LOW ──────────────────────────────────────────────────────────────────────

function missingPhone(ctx: RecruiterContext): RedFlag | null {
  if (ctx.resume.phone) return null;
  return {
    severity: 'LOW',
    category: 'missing_phone',
    description: 'Phone number not listed',
    evidence: 'Phone field absent from resume',
  };
}

// ─── Exported rule set ────────────────────────────────────────────────────────
// Evaluated in declaration order; the pipeline re-sorts by severity before display.

export const RED_FLAG_RULES: RuleFunction[] = [
  // CRITICAL
  noWorkEvidence,
  criticalSkillGap,
  zeroSkillsListed,
  // HIGH
  zeroQuantifiedImpact,
  experienceShortfall,
  noPortfolio,
  weakActionVerbs,
  substantialSkillGap,
  // MEDIUM
  missingEmail,
  sparseSkills,
  moderateSkillGap,
  lowQuantification,
  // LOW
  missingPhone,
];
