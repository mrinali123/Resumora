// Probability computation — translates ATS component scores into a 0-100
// shortlist probability, then adjusts with per-flag penalties and per-strength boosts.
//
// When a JD is present, skill match is weighted more heavily (it's the primary
// filter a recruiter applies). Without a JD, experience and impact take
// precedence since there's no role-specific bar to measure against.
//
// Hard cap: any CRITICAL red flag caps the final probability at 28 — a recruiter
// will not shortlist a candidate with a blocking gap regardless of other scores.

import type { RedFlag, Strength } from '../types';

// Points deducted per red flag
const SEVERITY_PENALTY: Record<string, number> = {
  CRITICAL: 22,
  HIGH: 12,
  MEDIUM: 6,
  LOW: 2,
};

// Points added per strength
const LEVEL_BOOST: Record<string, number> = {
  STANDOUT: 15,
  STRONG: 8,
  NOTABLE: 3,
};

// Maximum probability when at least one CRITICAL flag exists
const CRITICAL_PROBABILITY_CAP = 28;

export interface ProbabilityResult {
  shortlist_probability: number;
  base_score: number;
  penalties: number;
  boosts: number;
  has_critical_flag: boolean;
}

export function computeProbability(
  skillScore: number,
  expScore: number,
  projectScore: number,
  impactScore: number,
  formattingScore: number,
  hasJd: boolean,
  redFlags: RedFlag[],
  strengths: Strength[],
): ProbabilityResult {
  const base = hasJd
    ? Math.round(
        skillScore    * 0.40 +
        expScore      * 0.30 +
        projectScore  * 0.15 +
        impactScore   * 0.15,
      )
    : Math.round(
        expScore      * 0.35 +
        projectScore  * 0.25 +
        impactScore   * 0.25 +
        formattingScore * 0.15,
      );

  const penalties = redFlags.reduce(
    (sum, f) => sum + (SEVERITY_PENALTY[f.severity] ?? 0),
    0,
  );

  const boosts = strengths.reduce(
    (sum, s) => sum + (LEVEL_BOOST[s.level] ?? 0),
    0,
  );

  const hasCriticalFlag = redFlags.some((f) => f.severity === 'CRITICAL');

  let final = base + boosts - penalties;
  if (hasCriticalFlag) {
    final = Math.min(final, CRITICAL_PROBABILITY_CAP);
  }

  return {
    shortlist_probability: Math.max(0, Math.min(100, Math.round(final))),
    base_score: base,
    penalties,
    boosts,
    has_critical_flag: hasCriticalFlag,
  };
}

// Decision boundary:
//   probability ≥ 65 AND no CRITICAL flag → Shortlist
//   probability < 35 OR any CRITICAL flag → Reject
//   otherwise                              → Maybe
export function makeDecision(
  probability: number,
  hasCriticalFlag: boolean,
): 'Reject' | 'Maybe' | 'Shortlist' {
  if (hasCriticalFlag || probability < 35) return 'Reject';
  if (probability >= 65) return 'Shortlist';
  return 'Maybe';
}
