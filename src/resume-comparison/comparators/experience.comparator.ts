// ─── Experience Comparator ───────────────────────────────────────────────────
//
// Matching strategy (two-phase):
//
// Phase 1 — Entry matching:
//   Pair experience entries between A and B by company name.
//   Exact normalised match takes priority; if no exact match found,
//   use Levenshtein distance ≤ 3 as a fuzzy fallback (handles "TechCorp India"
//   vs "TechCorp" or minor typo fixes between versions).
//   Unmatched A entries → removed roles; unmatched B entries → new roles.
//
// Phase 2 — Bullet matching within paired entries:
//   For each (A entry, B entry) pair, compare their bullet lists.
//   Two bullets are "the same" if their Jaccard token similarity > 0.40.
//   Once matched, classify the B bullet as:
//     'unchanged'   — identical or near-identical text
//     'quantified'  — A lacked numeric metrics; B has them
//     'expanded'    — B version is ≥ 60 chars longer (substantial expansion)
//   Bullets in B with no A match → 'added'
//   Bullets in A with no B match → 'removed'
//
// "Quantification" detection: numeric regex patterns for %, $, ×, large numbers.
// Same approach as impact-metrics scorer, kept local to avoid cross-module coupling.

import { levenshtein, jaccardSimilarity, tokenise } from '../../parser/utils/text.utils';
import type { ResumeJson } from '../../jd-matching/types';
import type {
  BulletChange,
  BulletChangeType,
  ExperienceDelta,
  ExperienceEntryDelta,
} from '../types';

// ─── Metric detection (mirrored from impact-metrics scorer) ───────────────────

const METRIC_RE = /\$[\d,.]+[KkMmBb]?\b|\b\d[\d,]*(?:\.\d+)?\s*(?:%|×|x|X|ms|sec|seconds?|hrs?|hours?|[KkMmBb]\b)/;
const LARGE_NUMBER_RE = /\b\d{4,}[\d,]*\b/;

function hasMetric(text: string): boolean {
  return METRIC_RE.test(text) || LARGE_NUMBER_RE.test(text);
}

// ─── Normalisation ────────────────────────────────────────────────────────────

function normCompany(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ─── Bullet-level comparison ──────────────────────────────────────────────────

// Threshold for "same bullet": a bullet pair is considered matching when
// their combined similarity score (Jaccard blended with containment) exceeds this.
// Using containment in addition to Jaccard prevents short bullets like
// "Worked on microservices" from failing to match their expanded version
// "Led microservices platform serving 2M+ users" — the key nouns are shared
// even though the length ratio is large.
const SAME_BULLET_THRESHOLD = 0.30;
const EXPANDED_LENGTH_DELTA = 60; // chars

// Containment similarity: |intersection| / |smaller set|
// This measures "what fraction of the shorter bullet's vocabulary appears in the longer one"
// and is robust when a bullet is expanded but the core subject remains.
function containmentSim(tokA: string[], tokB: string[]): number {
  const setA = new Set(tokA);
  const setB = new Set(tokB);
  const smaller = setA.size <= setB.size ? setA : setB;
  const larger  = setA.size <= setB.size ? setB : setA;
  if (smaller.size === 0) return 0;
  let shared = 0;
  for (const t of smaller) { if (larger.has(t)) shared++; }
  return shared / smaller.size;
}

// Combined score: max of Jaccard and containment so that BOTH near-identical
// bullets (high Jaccard) and expanded bullets (high containment) match correctly.
function bulletSimilarity(tokA: string[], tokB: string[]): number {
  return Math.max(jaccardSimilarity(tokA, tokB), containmentSim(tokA, tokB));
}

function classifyBulletPair(bulletA: string, bulletB: string): BulletChangeType {
  if (bulletA === bulletB) return 'unchanged';

  const tokA = tokenise(bulletA.toLowerCase());
  const tokB = tokenise(bulletB.toLowerCase());
  const sim = bulletSimilarity(tokA, tokB);

  if (sim < SAME_BULLET_THRESHOLD) {
    // Not the same bullet — treated as independent add/remove
    return 'added';
  }

  // Same bullet, check if it improved
  const gainedMetrics = !hasMetric(bulletA) && hasMetric(bulletB);
  if (gainedMetrics) return 'quantified';

  const expanded = bulletB.length - bulletA.length >= EXPANDED_LENGTH_DELTA;
  if (expanded) return 'expanded';

  return 'unchanged';
}

// Match bullet lists between two entries.
// Returns changes from the perspective of "what happened going from A → B".
function matchBullets(bulletsA: string[], bulletsB: string[]): BulletChange[] {
  const changes: BulletChange[] = [];
  const matchedAIndices = new Set<number>();
  const matchedBIndices = new Set<number>();

  // For each B bullet, find the closest A bullet
  for (let bi = 0; bi < bulletsB.length; bi++) {
    let bestSim = 0;
    let bestAi = -1;

    for (let ai = 0; ai < bulletsA.length; ai++) {
      if (matchedAIndices.has(ai)) continue;
      const tokA = tokenise(bulletsA[ai].toLowerCase());
      const tokB = tokenise(bulletsB[bi].toLowerCase());
      const sim = bulletSimilarity(tokA, tokB);
      if (sim > bestSim) {
        bestSim = sim;
        bestAi = ai;
      }
    }

    if (bestSim >= SAME_BULLET_THRESHOLD && bestAi !== -1) {
      matchedAIndices.add(bestAi);
      matchedBIndices.add(bi);

      const type = classifyBulletPair(bulletsA[bestAi], bulletsB[bi]);
      const change: BulletChange = { type, text: bulletsB[bi] };

      if (type !== 'unchanged') {
        change.text_a = bulletsA[bestAi];
        change.text_b = bulletsB[bi];
      }

      changes.push(change);
    }
  }

  // Unmatched A bullets → removed
  for (let ai = 0; ai < bulletsA.length; ai++) {
    if (!matchedAIndices.has(ai)) {
      changes.push({ type: 'removed', text: bulletsA[ai] });
    }
  }

  // Unmatched B bullets → added
  for (let bi = 0; bi < bulletsB.length; bi++) {
    if (!matchedBIndices.has(bi)) {
      changes.push({ type: 'added', text: bulletsB[bi] });
    }
  }

  return changes;
}

// ─── Entry-level matching ─────────────────────────────────────────────────────

const MAX_COMPANY_LEVENSHTEIN = 3;

function findBestMatch(
  targetCompany: string,
  candidates: Array<{ company: string; index: number }>,
  usedIndices: Set<number>,
): number {
  const normTarget = normCompany(targetCompany);
  let bestDist = Infinity;
  let bestIdx = -1;

  for (const { company, index } of candidates) {
    if (usedIndices.has(index)) continue;
    const dist = levenshtein(normTarget, normCompany(company));
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = index;
    }
  }

  return bestDist <= MAX_COMPANY_LEVENSHTEIN ? bestIdx : -1;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function compareExperience(
  expA: ResumeJson['experience'],
  expB: ResumeJson['experience'],
): ExperienceDelta {
  const entries: ExperienceEntryDelta[] = [];
  const matchedBIndices = new Set<number>();

  const bCandidates = expB.map((e, i) => ({ company: e.company, index: i }));

  // Match each A entry to a B entry
  for (const entryA of expA) {
    const matchedBIdx = findBestMatch(entryA.company, bCandidates, matchedBIndices);

    if (matchedBIdx === -1) {
      // Role was in A but not B → removed
      entries.push({
        company: entryA.company,
        role_a: entryA.role,
        role_b: null,
        change_type: 'removed',
        bullet_changes: entryA.bulletPoints.map((b) => ({ type: 'removed', text: b })),
        bullets_added: 0,
        bullets_removed: entryA.bulletPoints.length,
        bullets_quantified: 0,
        bullets_expanded: 0,
      });
    } else {
      matchedBIndices.add(matchedBIdx);
      const entryB = expB[matchedBIdx];
      const bulletChanges = matchBullets(entryA.bulletPoints, entryB.bulletPoints);

      const bulletsAdded = bulletChanges.filter((c) => c.type === 'added').length;
      const bulletsRemoved = bulletChanges.filter((c) => c.type === 'removed').length;
      const bulletsQuantified = bulletChanges.filter((c) => c.type === 'quantified').length;
      const bulletsExpanded = bulletChanges.filter((c) => c.type === 'expanded').length;

      const hasAnyChange = bulletsAdded > 0 || bulletsRemoved > 0 ||
        bulletsQuantified > 0 || bulletsExpanded > 0 ||
        entryA.role !== entryB.role || entryA.duration !== entryB.duration;

      entries.push({
        company: entryB.company,
        role_a: entryA.role,
        role_b: entryB.role,
        change_type: hasAnyChange ? 'modified' : 'unchanged',
        bullet_changes: bulletChanges,
        bullets_added: bulletsAdded,
        bullets_removed: bulletsRemoved,
        bullets_quantified: bulletsQuantified,
        bullets_expanded: bulletsExpanded,
      });
    }
  }

  // Unmatched B entries → new roles
  for (let i = 0; i < expB.length; i++) {
    if (!matchedBIndices.has(i)) {
      const entryB = expB[i];
      entries.push({
        company: entryB.company,
        role_a: null,
        role_b: entryB.role,
        change_type: 'added',
        bullet_changes: entryB.bulletPoints.map((b) => ({ type: 'added', text: b })),
        bullets_added: entryB.bulletPoints.length,
        bullets_removed: 0,
        bullets_quantified: 0,
        bullets_expanded: 0,
      });
    }
  }

  const newRoles = entries
    .filter((e) => e.change_type === 'added')
    .map((e) => e.company);

  const removedRoles = entries
    .filter((e) => e.change_type === 'removed')
    .map((e) => e.company);

  const totalBulletsA = expA.reduce((s, e) => s + e.bulletPoints.length, 0);
  const totalBulletsB = expB.reduce((s, e) => s + e.bulletPoints.length, 0);

  const quantificationImprovements = entries.reduce(
    (s, e) => s + e.bullets_quantified,
    0,
  );

  return {
    entries,
    new_roles: newRoles,
    removed_roles: removedRoles,
    total_bullets_a: totalBulletsA,
    total_bullets_b: totalBulletsB,
    total_bullets_delta: totalBulletsB - totalBulletsA,
    quantification_improvements: quantificationImprovements,
  };
}
