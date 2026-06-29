// ─── Experience Relevance Scorer (25% of overall) ────────────────────────────
//
// Four sub-scores blended with documented weights:
//
//   1. years_adequacy       (0.30) — candidate years vs JD stated minimum
//   2. responsibility_overlap (0.40) — Jaccard on 4+-char non-stopword tokens
//                                      between all resume bullets and JD text
//   3. seniority_alignment   (0.20) — title seniority level match
//   4. role_diversity        (0.10) — number of distinct employers
//
// Evidence includes the actual overlapping responsibility keywords so a UI
// can highlight them directly in the resume and JD text.

import type { ResumeJson } from '../../jd-matching/types';
import type { ComponentScore, EvidenceItem, SubScore } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'this', 'that', 'with', 'from', 'have', 'will',
  'your', 'their', 'they', 'what', 'when', 'where', 'which', 'while', 'team',
  'work', 'role', 'about', 'into', 'also', 'more', 'some', 'our', 'you', 'we',
  'be', 'to', 'of', 'in', 'a', 'is', 'it', 'at', 'on', 'do', 'or', 'an',
  'by', 'as', 'up', 'if', 'so', 'not', 'but', 'all', 'new', 'can', 'has',
  'had', 'was', 'its', 'one', 'may', 'use', 'set', 'any', 'both',
]);

// Rank 0–10; null = not detected
const SENIORITY_RANK: Record<string, number> = {
  intern: 0,
  junior: 1,
  'entry-level': 1,
  entry: 1,
  associate: 2,
  mid: 3,
  'mid-level': 3,
  senior: 4,
  staff: 5,
  lead: 5,
  principal: 6,
  architect: 6,
  director: 7,
  vp: 8,
  'vice president': 8,
  cto: 9,
  ceo: 9,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const YEARS_RE =
  /\b(?:(?:at\s+least|minimum\s+of|minimum|at\s+minimum)\s+)?(\d+)(?:\+|(?:\s*[-–]\s*\d+))?\s+years?(?:\s+of\s+experience)?\b/gi;

const CURRENT_RE = /\b(present|current|now|ongoing|till\s*date|to\s*date)\b/i;

function extractYearsRequired(jd: string): number | null {
  const matches = [...jd.matchAll(YEARS_RE)];
  const years = matches.map((m) => parseInt(m[1], 10)).filter((y) => y >= 1 && y <= 30);
  return years.length > 0 ? Math.max(...years) : null;
}

function estimateCandidateYears(experience: ResumeJson['experience']): number | null {
  if (experience.length === 0) return null;
  const currentYear = new Date().getFullYear();
  let totalMonths = 0;
  let parsed = 0;

  for (const exp of experience) {
    if (!exp.duration) continue;
    const yearMatches = [...exp.duration.matchAll(/\b(19|20)(\d{2})\b/g)];
    if (yearMatches.length === 0) continue;
    const start = parseInt(yearMatches[0][0], 10);
    const end = CURRENT_RE.test(exp.duration)
      ? currentYear
      : yearMatches.length >= 2
        ? parseInt(yearMatches[yearMatches.length - 1][0], 10)
        : start;
    const months = (end - start) * 12;
    if (months > 0 && months <= 480) { totalMonths += months; parsed++; }
  }

  if (parsed === 0) return experience.length > 0 ? experience.length * 1.5 : null;
  return parseFloat((totalMonths / 12).toFixed(1));
}

function tokenise(text: string): string[] {
  return (text.toLowerCase().match(/\b[a-z][a-z0-9]{2,}\b/g) ?? []).filter(
    (t) => !STOPWORDS.has(t) && t.length >= 4,
  );
}

// Returns top-N overlapping tokens (by frequency in bullets) between bullets and JD
function getOverlapKeywords(bullets: string[], jd: string, topN: number): string[] {
  const jdTokenSet = new Set(tokenise(jd));
  const freq = new Map<string, number>();

  for (const t of tokenise(bullets.join(' '))) {
    if (jdTokenSet.has(t)) freq.set(t, (freq.get(t) ?? 0) + 1);
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([t]) => t);
}

function responsibilityOverlapScore(experience: ResumeJson['experience'], jd: string): number {
  const allBullets = experience.flatMap((e) => e.bulletPoints);
  if (allBullets.length === 0) return 35; // neutral when no bullets

  const bulletTokens = new Set(tokenise(allBullets.join(' ')));
  const jdTokens = new Set(tokenise(jd));
  if (jdTokens.size === 0) return 50;

  let intersection = 0;
  for (const t of bulletTokens) { if (jdTokens.has(t)) intersection++; }
  const union = bulletTokens.size + jdTokens.size - intersection;
  const jaccard = union > 0 ? intersection / union : 0;
  // Scale: jaccard=0.10→40, 0.20→80, 0.25→100
  return Math.min(100, Math.round(jaccard * 400));
}

function detectSeniorityRank(text: string): number | null {
  const lower = text.toLowerCase();
  let best: number | null = null;
  for (const [kw, rank] of Object.entries(SENIORITY_RANK)) {
    if (new RegExp(`\\b${kw.replace('-', '[- ]')}\\b`).test(lower)) {
      if (best === null || rank > best) best = rank;
    }
  }
  return best;
}

function seniorityAlignmentScore(
  experience: ResumeJson['experience'],
  jd: string,
): { score: number; candidateLabel: string | null; jdLabel: string | null } {
  const allTitles = experience.map((e) => e.role ?? '').join(' ');
  const candidateRank = detectSeniorityRank(allTitles);
  const jdRank = detectSeniorityRank(jd);

  const rankToLabel = (r: number | null) => {
    if (r === null) return null;
    return Object.entries(SENIORITY_RANK).find(([, v]) => v === r)?.[0] ?? null;
  };

  if (jdRank === null || candidateRank === null) {
    return { score: 70, candidateLabel: rankToLabel(candidateRank), jdLabel: rankToLabel(jdRank) };
  }

  const diff = candidateRank - jdRank;
  let score: number;
  if (diff >= 0) score = Math.min(100, 80 + diff * 5); // meets or exceeds
  else if (diff === -1) score = 65;                      // one level below
  else score = Math.max(0, 50 + diff * 15);             // two or more below

  return { score, candidateLabel: rankToLabel(candidateRank), jdLabel: rankToLabel(jdRank) };
}

function roleDiversityScore(experience: ResumeJson['experience']): number {
  const companies = new Set(experience.map((e) => e.company.toLowerCase()));
  const n = companies.size;
  if (n === 0) return 0;
  if (n === 1) return 40;
  if (n === 2) return 70;
  if (n === 3) return 85;
  return 100;
}

// ─── Main scorer ──────────────────────────────────────────────────────────────

export function scoreExperienceRelevance(resume: ResumeJson, jd: string): ComponentScore {
  // ── Compute sub-scores ────────────────────────────────────────────────────
  const yearsRequired = extractYearsRequired(jd);
  const yearsCandidate = estimateCandidateYears(resume.experience);

  let yearsScore: number;
  if (yearsRequired === null || yearsCandidate === null) {
    yearsScore = 70;
  } else if (yearsCandidate >= yearsRequired) {
    yearsScore = Math.min(100, 80 + Math.round(Math.min(20, (yearsCandidate - yearsRequired) * 5)));
  } else {
    yearsScore = Math.round((yearsCandidate / yearsRequired) * 80);
  }

  const responsibilityScore = responsibilityOverlapScore(resume.experience, jd);
  const { score: seniorityScore, candidateLabel, jdLabel } = seniorityAlignmentScore(resume.experience, jd);
  const diversityScore = roleDiversityScore(resume.experience);

  // Weighted blend
  const rawScore =
    yearsScore * 0.30 +
    responsibilityScore * 0.40 +
    seniorityScore * 0.20 +
    diversityScore * 0.10;

  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  // ── Evidence ──────────────────────────────────────────────────────────────
  const evidence: EvidenceItem[] = [];

  // Years
  evidence.push({
    type: 'years_comparison',
    label: 'Experience years',
    value:
      yearsRequired !== null && yearsCandidate !== null
        ? `${yearsCandidate} yr estimated / ${yearsRequired}+ yr required`
        : yearsCandidate !== null
          ? `${yearsCandidate} yr estimated (no minimum stated in JD)`
          : 'Could not estimate candidate years from resume dates',
    source: 'both',
    polarity: yearsCandidate !== null && yearsRequired !== null && yearsCandidate >= yearsRequired
      ? 'positive'
      : 'neutral',
  });

  // Seniority
  if (candidateLabel !== null || jdLabel !== null) {
    evidence.push({
      type: 'seniority_signal',
      label: 'Seniority alignment',
      value: `Resume: ${candidateLabel ?? 'undetected'} → JD: ${jdLabel ?? 'unspecified'}`,
      source: 'both',
      polarity: seniorityScore >= 70 ? 'positive' : seniorityScore >= 50 ? 'neutral' : 'negative',
    });
  }

  // Overlapping responsibility keywords (top 10)
  const overlapKws = getOverlapKeywords(
    resume.experience.flatMap((e) => e.bulletPoints),
    jd,
    10,
  );
  for (const kw of overlapKws) {
    evidence.push({
      type: 'overlap_keyword',
      label: 'Shared responsibility keyword',
      value: kw,
      source: 'both',
      polarity: 'positive',
    });
  }

  // Role diversity
  evidence.push({
    type: 'seniority_signal',
    label: 'Role diversity',
    value: `${new Set(resume.experience.map((e) => e.company.toLowerCase())).size} employer(s)`,
    source: 'resume',
    polarity: diversityScore >= 70 ? 'positive' : 'neutral',
  });

  // ── Sub-scores ────────────────────────────────────────────────────────────
  const subScores: SubScore[] = [
    {
      name: 'Years adequacy',
      raw_value: yearsCandidate ?? 0,
      score: Math.round(yearsScore),
      weight: 0.30,
      formula:
        yearsRequired !== null
          ? `min(1, candidate_years / ${yearsRequired}) × 80, capped at 100`
          : 'Neutral 70 — no minimum years found in JD',
    },
    {
      name: 'Responsibility overlap',
      raw_value: responsibilityScore / 100,
      score: responsibilityScore,
      weight: 0.40,
      formula: '|bullets ∩ jd_tokens| / |bullets ∪ jd_tokens| × 400, capped at 100',
    },
    {
      name: 'Seniority alignment',
      raw_value: candidateLabel !== null ? SENIORITY_RANK[candidateLabel] ?? 0 : 0,
      score: Math.round(seniorityScore),
      weight: 0.20,
      formula: 'rank_diff >= 0 → min(100, 80 + diff×5); rank_diff = -1 → 65; lower → linear decay',
    },
    {
      name: 'Role diversity',
      raw_value: new Set(resume.experience.map((e) => e.company.toLowerCase())).size,
      score: diversityScore,
      weight: 0.10,
      formula: '1 employer→40, 2→70, 3→85, 4+→100',
    },
  ];

  // ── Explanation ───────────────────────────────────────────────────────────
  const yearsText =
    yearsRequired !== null && yearsCandidate !== null
      ? `~${yearsCandidate} year(s) estimated vs ${yearsRequired}+ required (${yearsScore >= 80 ? 'met' : 'below threshold'})`
      : 'years requirement not specified or not parseable';

  const responsibilityText =
    responsibilityScore >= 60
      ? `strong responsibility overlap with JD (${overlapKws.slice(0, 3).join(', ')})`
      : responsibilityScore >= 35
        ? `partial overlap with JD responsibilities`
        : 'limited overlap between resume bullets and JD text';

  const seniorityText =
    candidateLabel !== null
      ? `seniority detected as "${candidateLabel}"${jdLabel ? ` vs JD "${jdLabel}"` : ''}`
      : 'no seniority level detected in titles';

  const explanation = `Experience: ${yearsText}. ${responsibilityText.charAt(0).toUpperCase() + responsibilityText.slice(1)}. ${seniorityText.charAt(0).toUpperCase() + seniorityText.slice(1)}. Role diversity: ${new Set(resume.experience.map((e) => e.company)).size} employer(s).`;

  return {
    component: 'experience_relevance',
    name: 'Experience Relevance',
    weight: 0.25,
    raw_score: score,
    weighted_score: parseFloat((score * 0.25).toFixed(1)),
    explanation,
    evidence,
    sub_scores: subScores,
  };
}
