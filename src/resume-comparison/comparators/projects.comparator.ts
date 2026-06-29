// ─── Projects Comparator ─────────────────────────────────────────────────────
//
// Matching strategy:
//   1. Exact project name match (normalised: lowercase, no punctuation)
//   2. Fuzzy fallback: Levenshtein ≤ 3 on normalised names
//
// For each matched pair, detect:
//   - Tech added / removed (case-insensitive set diff on techStack)
//   - Description improved: B description is substantively longer than A's
//     (threshold: ≥ 40 chars longer, or null → present)
//   - Metrics added: B description now contains quantified impact that A didn't
//
// Unmatched A projects → removed
// Unmatched B projects → added

import { levenshtein } from '../../parser/utils/text.utils';
import type { ResumeJson } from '../../jd-matching/types';
import type { ProjectDelta, ProjectEntryDelta } from '../types';

// ─── Metric detection ─────────────────────────────────────────────────────────

const METRIC_RE = /\$[\d,.]+[KkMmBb]?\b|\b\d[\d,]*(?:\.\d+)?\s*(?:%|×|x|X|[KkMmBb]\b)/;
const LARGE_NUMBER_RE = /\b\d{4,}[\d,]*\b/;

function hasMetric(text: string | null): boolean {
  if (!text) return false;
  return METRIC_RE.test(text) || LARGE_NUMBER_RE.test(text);
}

// ─── Normalisation ────────────────────────────────────────────────────────────

function normName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normTech(tech: string): string {
  return tech.toLowerCase().replace(/[.\-/\s]/g, '');
}

const MAX_NAME_LEVENSHTEIN = 3;

function findBestProjectMatch(
  targetName: string,
  candidates: Array<{ name: string; index: number }>,
  usedIndices: Set<number>,
): number {
  const normTarget = normName(targetName);
  let bestDist = Infinity;
  let bestIdx = -1;

  for (const { name, index } of candidates) {
    if (usedIndices.has(index)) continue;
    const dist = levenshtein(normTarget, normName(name));
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = index;
    }
  }

  return bestDist <= MAX_NAME_LEVENSHTEIN ? bestIdx : -1;
}

// ─── Tech stack diff ──────────────────────────────────────────────────────────

function techDiff(
  techA: string[],
  techB: string[],
): { newTech: string[]; removedTech: string[] } {
  const setA = new Map(techA.map((t) => [normTech(t), t]));
  const setB = new Map(techB.map((t) => [normTech(t), t]));

  const newTech = techB.filter((t) => !setA.has(normTech(t)));
  const removedTech = techA.filter((t) => !setB.has(normTech(t)));

  return { newTech, removedTech };
}

// Description improvement: B is at least DESC_GROWTH_THRESHOLD chars longer,
// or A had no description and B does.
const DESC_GROWTH_THRESHOLD = 40;

function descriptionImproved(descA: string | null, descB: string | null): boolean {
  if (!descB) return false;
  if (!descA) return true; // any description > nothing
  return descB.length - descA.length >= DESC_GROWTH_THRESHOLD;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function compareProjects(
  projA: ResumeJson['projects'],
  projB: ResumeJson['projects'],
): ProjectDelta {
  const entries: ProjectEntryDelta[] = [];
  const matchedBIndices = new Set<number>();

  const bCandidates = projB.map((p, i) => ({ name: p.name, index: i }));

  // Match each A project to a B project
  for (const pA of projA) {
    const matchedBIdx = findBestProjectMatch(pA.name, bCandidates, matchedBIndices);

    if (matchedBIdx === -1) {
      entries.push({
        name: pA.name,
        change_type: 'removed',
        new_tech: [],
        removed_tech: pA.techStack,
        description_improved: false,
        metrics_added: false,
      });
    } else {
      matchedBIndices.add(matchedBIdx);
      const pB = projB[matchedBIdx];

      const { newTech, removedTech } = techDiff(pA.techStack, pB.techStack);
      const descImproved = descriptionImproved(pA.description, pB.description);
      const metricsAdded = !hasMetric(pA.description) && hasMetric(pB.description);

      const hasAnyChange =
        newTech.length > 0 ||
        removedTech.length > 0 ||
        descImproved ||
        metricsAdded;

      entries.push({
        name: pB.name,
        change_type: hasAnyChange ? 'improved' : 'unchanged',
        new_tech: newTech,
        removed_tech: removedTech,
        description_improved: descImproved,
        metrics_added: metricsAdded,
      });
    }
  }

  // Unmatched B projects → new
  for (let i = 0; i < projB.length; i++) {
    if (!matchedBIndices.has(i)) {
      const pB = projB[i];
      entries.push({
        name: pB.name,
        change_type: 'added',
        new_tech: pB.techStack,
        removed_tech: [],
        description_improved: Boolean(pB.description?.trim()),
        metrics_added: hasMetric(pB.description),
      });
    }
  }

  const newProjects = entries.filter((e) => e.change_type === 'added').map((e) => e.name);
  const removedProjects = entries.filter((e) => e.change_type === 'removed').map((e) => e.name);

  const totalTechA = projA.reduce((s, p) => s + p.techStack.length, 0);
  const totalTechB = projB.reduce((s, p) => s + p.techStack.length, 0);

  return {
    entries,
    new_projects: newProjects,
    removed_projects: removedProjects,
    total_tech_a: totalTechA,
    total_tech_b: totalTechB,
    total_tech_delta: totalTechB - totalTechA,
  };
}
