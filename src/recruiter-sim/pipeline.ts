// Recruiter Simulation Engine
//
// Entry point: simulate_recruiter(input) → RecruiterSimResult
//
// Pipeline:
//   1. Run explain_score(resume, jd) to get ATS component scores
//   2. Build RecruiterContext from resume + ATS result + re-extracted JD data
//   3. Evaluate RED_FLAG_RULES → filter nulls → sort by severity
//   4. Evaluate STRENGTH_RULES → filter nulls → sort by level
//   5. Compute shortlist_probability from base score + penalties + boosts
//   6. Derive recruiter_decision from probability + hard flags
//   7. Build missing_requirements list from JD evidence + resume gaps
//   8. Generate recruiter_notes (3-sentence, deterministic)
//
// No LLM is called. Every value in the output is computed from the resume
// and JD inputs using the rule set and ATS scoring engine.

import { explain_score } from '../ats-scoring/pipeline';
import { RED_FLAG_RULES } from './rules/red-flag.rules';
import { STRENGTH_RULES } from './rules/strength.rules';
import { computeProbability, makeDecision } from './scoring/probability';
import { buildRecruiterNotes } from './notes/notes.builder';
import type {
  RecruiterSimInput,
  RecruiterSimResult,
  RecruiterContext,
  MissingRequirement,
  RedFlag,
  Strength,
} from './types';

// ─── Year extraction ──────────────────────────────────────────────────────────
// Mirrors the pattern used in experience-relevance.scorer.ts (not imported to
// avoid coupling to a private function in another module).

const YEARS_RE =
  /\b(?:(?:at\s+least|minimum\s+of|minimum)\s+)?(\d+)(?:\+|(?:\s*[-–]\s*\d+))?\s+years?(?:\s+of\s+experience)?\b/gi;

function extractYearsRequired(jd: string): number | null {
  const matches = [...jd.matchAll(YEARS_RE)];
  const years = matches.map((m) => parseInt(m[1], 10)).filter((y) => y >= 1 && y <= 30);
  return years.length > 0 ? Math.max(...years) : null;
}

// ─── Context builder ──────────────────────────────────────────────────────────

function buildContext(input: RecruiterSimInput): RecruiterContext {
  const jd = input.jobDescription ?? '';
  const hasJd = Boolean(input.jobDescription?.trim());
  const ats = explain_score(input.resume, jd);

  const getComp = (key: string) => ats.components.find((c) => c.component === key);

  const skillComp      = getComp('skills_match');
  const expComp        = getComp('experience_relevance');
  const projComp       = getComp('project_strength');
  const impactComp     = getComp('impact_metrics');
  const fmtComp        = getComp('formatting_quality');

  const skillScore      = skillComp?.raw_score      ?? 0;
  const expScore        = expComp?.raw_score         ?? 0;
  const projectScore    = projComp?.raw_score        ?? 0;
  const impactScore     = impactComp?.raw_score      ?? 0;
  const formattingScore = fmtComp?.raw_score         ?? 0;

  // Sub-score value extraction
  const yearsAdequacy   = expComp?.sub_scores.find((s) => s.name === 'Years adequacy');
  const yearsCandidate  = yearsAdequacy?.raw_value ?? 0;

  const roleDiversity   = expComp?.sub_scores.find((s) => s.name === 'Role diversity');
  const companyCount    = roleDiversity?.raw_value ??
    (input.resume.experience.length > 0 ? 1 : 0);

  const metricSub       = impactComp?.sub_scores.find((s) => s.name === 'Metric density');
  const metricDensity   = metricSub?.raw_value ?? 0;

  const verbSub         = impactComp?.sub_scores.find((s) => s.name === 'Action verb density');
  const actionVerbDensity = verbSub?.raw_value ?? 0;

  // Extract missing and matched skill names from evidence
  // Missing evidence value format: "SkillName (mentioned N× in JD)"
  const skillEvidence = skillComp?.evidence ?? [];
  const missingSkills = skillEvidence
    .filter((e) => e.type === 'missing_skill' && e.polarity === 'negative')
    .map((e) => {
      const m = e.value.match(/^([^(]+)/);
      return (m?.[1] ?? e.value).trim();
    });

  const matchedSkills = skillEvidence
    .filter((e) => e.type === 'matched_skill' && e.polarity === 'positive')
    .map((e) => e.value.trim());

  const yearsRequired = hasJd ? extractYearsRequired(jd) : null;

  return {
    resume: input.resume,
    jd,
    hasJd,
    ats,
    skillScore,
    expScore,
    projectScore,
    impactScore,
    formattingScore,
    yearsCandidate,
    yearsRequired,
    companyCount,
    metricDensity,
    actionVerbDensity,
    missingSkills,
    matchedSkills,
  };
}

// ─── Sort helpers ─────────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3,
};

const STRENGTH_ORDER: Record<string, number> = {
  STANDOUT: 0, STRONG: 1, NOTABLE: 2,
};

function sortFlags(flags: RedFlag[]): RedFlag[] {
  return [...flags].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

function sortStrengths(strengths: Strength[]): Strength[] {
  return [...strengths].sort((a, b) => STRENGTH_ORDER[a.level] - STRENGTH_ORDER[b.level]);
}

// ─── Missing requirements builder ─────────────────────────────────────────────

function buildMissingRequirements(ctx: RecruiterContext): MissingRequirement[] {
  const missing: MissingRequirement[] = [];

  // JD-derived: missing skills from the evidence array
  if (ctx.hasJd) {
    for (const skill of ctx.missingSkills.slice(0, 8)) {
      missing.push({ item: skill, priority: 'REQUIRED', source: 'jd' });
    }
    // Experience years shortfall
    if (ctx.yearsRequired !== null && ctx.yearsCandidate < ctx.yearsRequired * 0.67) {
      missing.push({
        item: `${ctx.yearsRequired}+ years of experience (estimated: ~${ctx.yearsCandidate} yr)`,
        priority: 'REQUIRED',
        source: 'jd',
      });
    }
  }

  // Inferred from resume structure (applies regardless of JD)
  if (ctx.resume.experience.length === 0) {
    missing.push({ item: 'Work experience', priority: 'REQUIRED', source: 'inferred' });
  }
  if (ctx.resume.projects.length === 0 && !ctx.hasJd) {
    missing.push({ item: 'Portfolio or side projects', priority: 'PREFERRED', source: 'inferred' });
  }
  const expBullets = ctx.resume.experience.flatMap((e) => e.bulletPoints);
  if (expBullets.length >= 3 && ctx.metricDensity === 0) {
    missing.push({
      item: 'Quantified achievements in experience bullets',
      priority: 'PREFERRED',
      source: 'inferred',
    });
  }

  return missing;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function simulate_recruiter(input: RecruiterSimInput): RecruiterSimResult {
  const ctx = buildContext(input);

  const allRedFlags  = RED_FLAG_RULES
    .map((r) => r(ctx))
    .filter((f): f is RedFlag => f !== null);

  const allStrengths = STRENGTH_RULES
    .map((r) => r(ctx))
    .filter((s): s is Strength => s !== null);

  const sortedFlags     = sortFlags(allRedFlags);
  const sortedStrengths = sortStrengths(allStrengths);

  const prob = computeProbability(
    ctx.skillScore,
    ctx.expScore,
    ctx.projectScore,
    ctx.impactScore,
    ctx.formattingScore,
    ctx.hasJd,
    sortedFlags,
    sortedStrengths,
  );

  const decision = makeDecision(prob.shortlist_probability, prob.has_critical_flag);

  const missingRequirements = buildMissingRequirements(ctx);

  const recruiterNotes = buildRecruiterNotes(
    decision,
    prob.shortlist_probability,
    sortedFlags,
    sortedStrengths,
    ctx.resume,
  );

  return {
    shortlist_probability: prob.shortlist_probability,
    recruiter_decision: decision,
    top_red_flags: sortedFlags,
    top_strengths: sortedStrengths,
    missing_requirements: missingRequirements,
    recruiter_notes: recruiterNotes,

    _debug: {
      base_score: prob.base_score,
      penalties: prob.penalties,
      boosts: prob.boosts,
      has_critical_flag: prob.has_critical_flag,
      ats_summary: {
        overall: ctx.ats.overall_score,
        grade: ctx.ats.grade,
        skills: ctx.skillScore,
        experience: ctx.expScore,
        projects: ctx.projectScore,
        impact: ctx.impactScore,
        formatting: ctx.formattingScore,
      },
    },
  };
}
