// ─── Impact & Metrics Scorer (10% of overall) ────────────────────────────────
//
// Measures how well the candidate quantifies and articulates their impact.
// Scans all experience bullet points (and project descriptions) with regex
// — no LLM, no heuristic black box.
//
// Three sub-scores blended with documented weights:
//
//   1. metric_density    (0.45) — fraction of bullets containing numeric evidence
//      Patterns: percentages (40%), multipliers (3×), dollar amounts ($1M),
//                large numbers (2,000,000 users), latency numbers (200ms)
//
//   2. action_verb_density (0.35) — fraction of bullets beginning with a strong
//      engineering action verb (Led, Built, Reduced, Deployed, …)
//
//   3. scale_indicators   (0.20) — count of unique scale/impact words found
//      (users, revenue, throughput, latency, requests, …)
//      scored on a log curve, capped at 100
//
// Evidence: the actual bullet strings that contain metrics or action verbs.

import type { ResumeJson } from '../../jd-matching/types';
import type { ComponentScore, EvidenceItem, SubScore } from '../types';

// ─── Detection patterns ───────────────────────────────────────────────────────

// Matches numeric quantities with common suffixes
// Examples: "40%", "3×", "$1M", "2,000 users", "200ms", "1.5x", "3x faster"
const METRIC_RE =
  /\$[\d,.]+[KkMmBb]?\b|\b\d[\d,]*(?:\.\d+)?\s*(?:%|×|x|X|ms|sec|seconds?|hrs?|hours?|[KkMmBb]\b)/g;

// Standalone large numbers (≥ 4 digits) or 3+ digit numbers with magnitude word nearby
const LARGE_NUMBER_RE = /\b\d{4,}[\d,]*\b/g;

// Patterns that indicate scale or impact
const SCALE_WORDS = [
  'users', 'customers', 'revenue', 'requests', 'transactions', 'throughput',
  'latency', 'uptime', 'availability', 'concurrent', 'per second', 'per day',
  'monthly', 'weekly', 'daily', 'traffic', 'load', 'stars', 'downloads',
  'deployments', 'releases', 'incidents', 'coverage', 'accuracy',
] as const;

// Engineering action verbs — must appear at the START of a bullet
// (after stripping the bullet character)
const ACTION_VERBS = new Set([
  'led', 'built', 'designed', 'architected', 'developed', 'implemented',
  'delivered', 'deployed', 'launched', 'created', 'established', 'founded',
  'reduced', 'improved', 'increased', 'optimised', 'optimized', 'accelerated',
  'scaled', 'grew', 'cut', 'saved', 'eliminated', 'automated',
  'migrated', 'refactored', 'rewrote', 'consolidated', 'unified',
  'mentored', 'coached', 'hired', 'managed', 'supervised',
  'integrated', 'shipped', 'released', 'published',
  'researched', 'analysed', 'analyzed', 'evaluated', 'audited',
  'collaborated', 'partnered', 'spearheaded', 'championed', 'drove',
]);

// Bullet character prefixes to strip before checking the first word
const BULLET_PREFIX_RE = /^[•\-*◦▪●·►➢→✓✦‣⊳\d.]+\s*/;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasMetric(bullet: string): boolean {
  return METRIC_RE.test(bullet) || LARGE_NUMBER_RE.test(bullet);
}

// Reset stateful regex lastIndex before each use
function testMetric(bullet: string): boolean {
  METRIC_RE.lastIndex = 0;
  LARGE_NUMBER_RE.lastIndex = 0;
  return METRIC_RE.test(bullet) || LARGE_NUMBER_RE.test(bullet);
}

function hasActionVerb(bullet: string): boolean {
  const stripped = bullet.replace(BULLET_PREFIX_RE, '').trim().toLowerCase();
  const firstWord = stripped.split(/\s+/)[0] ?? '';
  return ACTION_VERBS.has(firstWord);
}

function findScaleWords(text: string): string[] {
  const lower = text.toLowerCase();
  return SCALE_WORDS.filter((w) => lower.includes(w));
}

// Log-curve for scale indicator count: 0→0, 1→35, 3→60, 5→80, 8→95, 10+→100
function scaleCountCurve(n: number): number {
  if (n === 0) return 0;
  return Math.min(100, Math.round(35 + 65 * (1 - Math.exp(-n / 4))));
}

// ─── Main scorer ──────────────────────────────────────────────────────────────

export function scoreImpactMetrics(resume: ResumeJson): ComponentScore {
  // Collect all bullet points from experience
  const expBullets = resume.experience.flatMap((e) => e.bulletPoints);

  // Also scan project descriptions for impact signals
  const projTexts = resume.projects
    .map((p) => p.description ?? '')
    .filter(Boolean);

  const allBullets = [...expBullets, ...projTexts];
  const totalBullets = allBullets.length;

  // ── Sub-score 1: metric density ───────────────────────────────────────────
  const bulletsWithMetrics = allBullets.filter(testMetric);
  const metricDensity = totalBullets > 0 ? bulletsWithMetrics.length / totalBullets : 0;
  const metricScore = Math.round(Math.min(100, metricDensity * 140)); // 72% density → 100

  // ── Sub-score 2: action verb density ─────────────────────────────────────
  const bulletsWithVerbs = expBullets.filter(hasActionVerb); // only experience bullets
  const verbDensity = expBullets.length > 0 ? bulletsWithVerbs.length / expBullets.length : 0;
  const verbScore = Math.round(Math.min(100, verbDensity * 130)); // 77% density → 100

  // ── Sub-score 3: scale indicators ────────────────────────────────────────
  const fullText = allBullets.join(' ');
  const scaleWordsFound = findScaleWords(fullText);
  const scaleScore = scaleCountCurve(scaleWordsFound.length);

  // ── Weighted blend ────────────────────────────────────────────────────────
  const rawScore = metricScore * 0.45 + verbScore * 0.35 + scaleScore * 0.20;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  // ── Evidence ──────────────────────────────────────────────────────────────
  const evidence: EvidenceItem[] = [];

  if (totalBullets === 0) {
    evidence.push({
      type: 'metric_bullet',
      label: 'No bullet points found',
      value: 'Add quantified achievements as bullet points in your experience section',
      source: 'resume',
      polarity: 'negative',
    });
  } else {
    // Show up to 5 metric-containing bullets
    for (const b of bulletsWithMetrics.slice(0, 5)) {
      evidence.push({
        type: 'metric_bullet',
        label: 'Quantified achievement',
        value: b.length > 120 ? b.slice(0, 120) + '…' : b,
        source: 'resume',
        polarity: 'positive',
      });
    }

    // Show up to 3 action-verb bullets (not already shown as metrics)
    const verbOnlyBullets = bulletsWithVerbs
      .filter((b) => !testMetric(b))
      .slice(0, 3);
    for (const b of verbOnlyBullets) {
      const firstWord = b.replace(BULLET_PREFIX_RE, '').split(/\s+/)[0];
      evidence.push({
        type: 'action_verb',
        label: `Action verb: "${firstWord}"`,
        value: b.length > 100 ? b.slice(0, 100) + '…' : b,
        source: 'resume',
        polarity: 'positive',
      });
    }

    // Scale indicators found
    for (const sw of scaleWordsFound.slice(0, 5)) {
      evidence.push({
        type: 'scale_indicator',
        label: 'Scale indicator found',
        value: `"${sw}" appears in resume`,
        source: 'resume',
        polarity: 'positive',
      });
    }

    // Bullets missing metrics — show first 2 as improvement suggestions
    const bulletsLackingMetrics = expBullets
      .filter((b) => !testMetric(b) && !hasActionVerb(b))
      .slice(0, 2);
    for (const b of bulletsLackingMetrics) {
      evidence.push({
        type: 'metric_bullet',
        label: 'Bullet lacks metrics or action verb',
        value: b.length > 100 ? b.slice(0, 100) + '…' : b,
        source: 'resume',
        polarity: 'negative',
      });
    }
  }

  // ── Sub-score objects ─────────────────────────────────────────────────────
  const uniqueVerbs = [
    ...new Set(
      expBullets
        .filter(hasActionVerb)
        .map((b) => b.replace(BULLET_PREFIX_RE, '').split(/\s+/)[0]?.toLowerCase() ?? ''),
    ),
  ].slice(0, 8);

  const subScores: SubScore[] = [
    {
      name: 'Metric density',
      raw_value: parseFloat(metricDensity.toFixed(3)),
      score: metricScore,
      weight: 0.45,
      formula: `${bulletsWithMetrics.length}/${totalBullets} bullets contain numbers/$ × 140, capped at 100`,
    },
    {
      name: 'Action verb density',
      raw_value: parseFloat(verbDensity.toFixed(3)),
      score: verbScore,
      weight: 0.35,
      formula: `${bulletsWithVerbs.length}/${expBullets.length} exp-bullets start with strong verb × 130, capped at 100`,
    },
    {
      name: 'Scale indicators',
      raw_value: scaleWordsFound.length,
      score: scaleScore,
      weight: 0.20,
      formula: `${scaleWordsFound.length} unique scale word(s) via log curve: 0→0, 5→80, 10+→100`,
    },
  ];

  // ── Explanation ───────────────────────────────────────────────────────────
  const metricText =
    metricDensity >= 0.6
      ? `${Math.round(metricDensity * 100)}% of bullets contain measurable results`
      : metricDensity >= 0.3
        ? `only ${Math.round(metricDensity * 100)}% of bullets are quantified`
        : totalBullets > 0
          ? 'very few bullets contain concrete numbers or measurements'
          : 'no bullet points found';

  const verbText =
    uniqueVerbs.length > 0
      ? `Action verbs used: ${uniqueVerbs.slice(0, 4).join(', ')}`
      : 'No strong action verbs detected at bullet start';

  const scaleText =
    scaleWordsFound.length > 0
      ? `Impact scale indicators: ${scaleWordsFound.slice(0, 3).join(', ')}`
      : 'No scale/impact keywords found (users, revenue, throughput, etc.)';

  const explanation = `${metricText.charAt(0).toUpperCase() + metricText.slice(1)}. ${verbText}. ${scaleText}.`;

  return {
    component: 'impact_metrics',
    name: 'Impact & Metrics Strength',
    weight: 0.10,
    raw_score: score,
    weighted_score: parseFloat((score * 0.10).toFixed(1)),
    explanation,
    evidence,
    sub_scores: subScores,
  };
}
