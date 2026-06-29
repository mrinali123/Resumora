// ─── Experience Scorer ────────────────────────────────────────────────────────
//
// Estimates how well the candidate's experience matches the JD's requirements.
// Two independent sub-signals are blended (0.45 : 0.55):
//
//   1. Years score (0.45 weight):
//        Extracts the maximum years-of-experience requirement from the JD text
//        using a set of common phrasing patterns. Then estimates the candidate's
//        total years by parsing date ranges in experience.duration strings.
//        Score = min(1, candidate / required) × 100, capped at 100 with a
//        small bonus for overqualified candidates.
//        Falls back to 70 (neutral) when either value is unresolvable.
//
//   2. Responsibility overlap score (0.55 weight):
//        Extracts all meaningful tokens (4+ chars, non-stopword) from:
//          a) the candidate's resume bullet points
//          b) the job description text
//        Computes a Jaccard-like overlap weighted toward the JD side.
//        Scaled from raw Jaccard (sparse in practice) to a 0–100 range.

import type { ResumeJson, ExperienceScoreBreakdown } from '../types';

export interface ExperienceScoreResult {
  score: number;
  breakdown: ExperienceScoreBreakdown;
}

// ─── Years requirement extraction ─────────────────────────────────────────────
// Matches: "5+ years", "3-5 years", "at least 3 years", "minimum of 5 years",
//          "5 years of experience", "3+ years experience", etc.
const YEARS_REQUIRED_RE =
  /\b(?:(?:at\s+least|minimum\s+of|minimum|at\s+minimum)\s+)?(\d+)(?:\+|(?:\s*[-–]\s*\d+))?\s+years?(?:\s+of\s+experience)?\b/gi;

function extractYearsRequired(jdText: string): number | null {
  const matches = [...jdText.matchAll(YEARS_REQUIRED_RE)];
  if (matches.length === 0) return null;

  const years = matches
    .map((m) => parseInt(m[1], 10))
    .filter((y) => y >= 1 && y <= 30); // sanity bounds

  return years.length > 0 ? Math.max(...years) : null;
}

// ─── Candidate years estimation ───────────────────────────────────────────────
// Parses the `duration` field of each experience entry.
// Supports: "Jan 2022 – Present", "2020 – 2023", "June 2021 to December 2023"

const CURRENT_MARKER_RE = /\b(present|current|now|ongoing|till\s*date|to\s*date)\b/i;

function extractYearsFromDuration(duration: string, currentYear: number): number {
  const yearMatches = [...duration.matchAll(/\b(19|20)(\d{2})\b/g)];
  if (yearMatches.length === 0) return 0;

  const startYear = parseInt(yearMatches[0][0], 10);
  const isCurrent = CURRENT_MARKER_RE.test(duration);
  const endYear = isCurrent
    ? currentYear
    : yearMatches.length >= 2
      ? parseInt(yearMatches[yearMatches.length - 1][0], 10)
      : startYear; // single year listed → 0 duration (counted as < 1 yr)

  const months = (endYear - startYear) * 12;
  // Sanity: ignore negative durations and entries > 40 years
  return months > 0 && months <= 480 ? months : 0;
}

function estimateCandidateYears(
  experience: ResumeJson['experience'],
): number | null {
  if (experience.length === 0) return null;

  const currentYear = new Date().getFullYear();
  let totalMonths = 0;
  let parsedCount = 0;

  for (const exp of experience) {
    if (!exp.duration) continue;
    const months = extractYearsFromDuration(exp.duration, currentYear);
    if (months > 0) {
      totalMonths += months;
      parsedCount++;
    }
  }

  if (parsedCount === 0) {
    // No parseable dates — rough heuristic: each role ≈ 1.5 years
    return parseFloat((experience.length * 1.5).toFixed(1));
  }

  return parseFloat((totalMonths / 12).toFixed(1));
}

// ─── Responsibility overlap ───────────────────────────────────────────────────

const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'this', 'that', 'with', 'from', 'have', 'will',
  'your', 'their', 'they', 'what', 'when', 'where', 'which', 'while', 'team',
  'work', 'role', 'about', 'into', 'also', 'more', 'some', 'our', 'you', 'we',
  'be', 'to', 'of', 'in', 'a', 'is', 'it', 'at', 'on', 'do', 'or', 'an',
  'by', 'as', 'up', 'if', 'so', 'no', 'not', 'but', 'all', 'new', 'can',
  'has', 'had', 'was', 'its', 'one', 'may', 'use', 'set', 'any', 'both',
  'very', 'well', 'good', 'high', 'large', 'strong', 'great', 'excellent',
]);

function tokeniseForOverlap(text: string): Set<string> {
  const tokens = text.toLowerCase().match(/\b[a-z][a-z0-9]{2,}\b/g) ?? [];
  return new Set(tokens.filter((t) => !STOPWORDS.has(t) && t.length >= 4));
}

function computeResponsibilityOverlap(
  experience: ResumeJson['experience'],
  jdText: string,
): number {
  const allBullets = experience.flatMap((e) => e.bulletPoints).join(' ');

  // If there are no bullet points, fall back to a neutral score
  if (!allBullets.trim()) return 40;

  const bulletTokens = tokeniseForOverlap(allBullets);
  const jdTokens = tokeniseForOverlap(jdText);

  if (jdTokens.size === 0) return 50;

  let intersection = 0;
  for (const t of bulletTokens) {
    if (jdTokens.has(t)) intersection++;
  }

  // Jaccard: |A ∩ B| / |A ∪ B|
  const union = bulletTokens.size + jdTokens.size - intersection;
  const jaccard = union > 0 ? intersection / union : 0;

  // Raw Jaccard is small by nature (0.05–0.25 for a well-matched pair).
  // Scale ×400 so jaccard=0.10 → 40, jaccard=0.20 → 80, capped at 100.
  return Math.min(100, Math.round(jaccard * 400));
}

// ─── Public scorer ────────────────────────────────────────────────────────────

export function computeExperienceScore(
  resume: ResumeJson,
  jdText: string,
): ExperienceScoreResult {
  const yearsRequired = extractYearsRequired(jdText);
  const yearsCandidate = estimateCandidateYears(resume.experience);

  let yearsScore: number;

  if (yearsRequired === null || yearsCandidate === null) {
    yearsScore = 70; // neutral when unresolvable
  } else if (yearsCandidate >= yearsRequired) {
    // Meets or exceeds; small bonus (up to +20) for being well above the bar
    yearsScore = Math.min(100, 80 + Math.round(Math.min(20, (yearsCandidate - yearsRequired) * 5)));
  } else {
    // Linear decay from 80 down to 0
    const ratio = yearsCandidate / yearsRequired;
    yearsScore = Math.round(ratio * 80);
  }

  const responsibilityScore = computeResponsibilityOverlap(resume.experience, jdText);

  const blended = yearsScore * 0.45 + responsibilityScore * 0.55;
  const score = Math.max(0, Math.min(100, Math.round(blended)));

  return {
    score,
    breakdown: {
      years_required: yearsRequired,
      years_candidate: yearsCandidate,
      years_score: Math.round(yearsScore),
      responsibility_overlap_score: Math.round(responsibilityScore),
    },
  };
}
