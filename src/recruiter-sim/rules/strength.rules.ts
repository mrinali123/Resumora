// Strength rules — each returns a Strength if the condition is met, null otherwise.
// Ordered by level: STANDOUT → STRONG → NOTABLE.

import type { Strength, RecruiterContext } from '../types';

type RuleFunction = (ctx: RecruiterContext) => Strength | null;

// ─── STANDOUT ─────────────────────────────────────────────────────────────────

function nearPerfectSkillMatch(ctx: RecruiterContext): Strength | null {
  if (!ctx.hasJd || ctx.skillScore < 80) return null;
  const sample = ctx.matchedSkills.slice(0, 4).join(', ');
  return {
    level: 'STANDOUT',
    category: 'near_perfect_skill_match',
    description: 'Near-complete technical skill alignment with the role',
    evidence: sample ? `Matched: ${sample}` : `Skill match score: ${ctx.skillScore}/100`,
  };
}

function strongQuantifiedImpact(ctx: RecruiterContext): Strength | null {
  if (ctx.impactScore < 65) return null;
  const total = ctx.resume.experience.flatMap((e) => e.bulletPoints).length;
  const withMetrics = Math.round(ctx.metricDensity * total);
  return {
    level: 'STANDOUT',
    category: 'strong_quantified_impact',
    description: 'Consistently quantified achievements — clear evidence of measurable impact',
    evidence: `${withMetrics} of ${total} bullet(s) contain numeric results`,
  };
}

// ─── STRONG ───────────────────────────────────────────────────────────────────

function goodSkillMatch(ctx: RecruiterContext): Strength | null {
  if (!ctx.hasJd || ctx.skillScore < 60 || ctx.skillScore >= 80) return null;
  return {
    level: 'STRONG',
    category: 'good_skill_match',
    description: 'Good technical coverage for the role with a few addressable gaps',
    evidence: `Skill match: ${ctx.skillScore}/100 — ${ctx.matchedSkills.slice(0, 3).join(', ')}`,
  };
}

function multiCompanyBackground(ctx: RecruiterContext): Strength | null {
  if (ctx.companyCount < 2 || ctx.expScore < 50) return null;
  const companies = [...new Set(ctx.resume.experience.map((e) => e.company))].slice(0, 3);
  return {
    level: 'STRONG',
    category: 'multi_company_experience',
    description: 'Multi-company background shows adaptability and breadth of exposure',
    evidence: companies.join(', '),
  };
}

function solidProjectPortfolio(ctx: RecruiterContext): Strength | null {
  if (ctx.projectScore < 60 || ctx.resume.projects.length < 2) return null;
  return {
    level: 'STRONG',
    category: 'solid_projects',
    description: 'Strong project portfolio demonstrates self-directed technical initiative',
    evidence: `${ctx.resume.projects.length} project(s) — ${ctx.resume.projects[0]?.name ?? ''}`,
  };
}

function meetsExperienceYears(ctx: RecruiterContext): Strength | null {
  if (!ctx.hasJd || ctx.yearsRequired === null || ctx.yearsCandidate < ctx.yearsRequired) return null;
  const surplus = (ctx.yearsCandidate - ctx.yearsRequired).toFixed(1);
  return {
    level: 'STRONG',
    category: 'meets_experience',
    description: 'Meets or exceeds the required experience threshold',
    evidence: `~${ctx.yearsCandidate} yr estimated vs ${ctx.yearsRequired}+ required (+${surplus} yr surplus)`,
  };
}

function broadSkillBreadth(ctx: RecruiterContext): Strength | null {
  // Only applicable when no JD is given (otherwise skill match takes priority)
  if (ctx.hasJd) return null;
  if (ctx.resume.skills.length < 10) return null;
  return {
    level: 'STRONG',
    category: 'broad_skill_breadth',
    description: 'Broad technical skill set spanning multiple domains',
    evidence: `${ctx.resume.skills.length} skills listed`,
  };
}

// ─── NOTABLE ──────────────────────────────────────────────────────────────────

function hasCertifications(ctx: RecruiterContext): Strength | null {
  if (ctx.resume.certifications.length === 0) return null;
  return {
    level: 'NOTABLE',
    category: 'has_certifications',
    description: 'Holds industry certifications — signals commitment to professional growth',
    evidence: ctx.resume.certifications[0],
  };
}

function wellFormatted(ctx: RecruiterContext): Strength | null {
  if (ctx.formattingScore < 75) return null;
  return {
    level: 'NOTABLE',
    category: 'good_formatting',
    description: 'Well-structured resume with all key sections and contact details present',
    evidence: `Formatting score: ${ctx.formattingScore}/100`,
  };
}

function multipleProjects(ctx: RecruiterContext): Strength | null {
  // Only when solidProjectPortfolio didn't already fire
  if (ctx.projectScore >= 60) return null;
  if (ctx.resume.projects.length < 3) return null;
  return {
    level: 'NOTABLE',
    category: 'multiple_projects',
    description: 'Multiple side projects reflect sustained technical engagement',
    evidence: `${ctx.resume.projects.length} projects listed`,
  };
}

// ─── Exported rule set ────────────────────────────────────────────────────────

export const STRENGTH_RULES: RuleFunction[] = [
  // STANDOUT
  nearPerfectSkillMatch,
  strongQuantifiedImpact,
  // STRONG
  goodSkillMatch,
  multiCompanyBackground,
  solidProjectPortfolio,
  meetsExperienceYears,
  broadSkillBreadth,
  // NOTABLE
  hasCertifications,
  wellFormatted,
  multipleProjects,
];
