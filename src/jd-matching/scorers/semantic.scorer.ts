// ─── Semantic Scorer ──────────────────────────────────────────────────────────
//
// Measures document-level alignment between the resume and the job description.
//
// Path A (embeddings available):
//   Cosine similarity of the caller-supplied L2-normalised full-doc vectors.
//   dotProduct == cosine_similarity for unit vectors.
//   Score = clamp(dotProduct × 100, 0, 100).
//
// Path B (no embeddings):
//   Extended Jaccard on cleaned token sets derived from both documents.
//   Tokens < 4 chars and stopwords are removed so the signal comes from
//   domain-specific words rather than function words.
//   Raw Jaccard is sparse in practice (0.05–0.25 for a good match),
//   so we scale ×400 to map that range into [0, 100].
//   This is a weaker signal than embeddings and weighted accordingly in pipeline.ts.

import { dotProduct } from '../../analysis/skills.utils';
import type { ResumeJson, SemanticScoreBreakdown } from '../types';

export interface SemanticScoreResult {
  score: number;
  breakdown: SemanticScoreBreakdown;
}

// ─── Resume → flat text ───────────────────────────────────────────────────────
// Serialises the structured resume JSON to a single text blob for tokenisation.
// Order: skills first (highest density), then experience, then projects.

function resumeToText(resume: ResumeJson): string {
  const parts: string[] = [];

  parts.push(...resume.skills);

  for (const exp of resume.experience) {
    if (exp.role) parts.push(exp.role);
    if (exp.company) parts.push(exp.company);
    parts.push(...exp.bulletPoints);
  }

  for (const proj of resume.projects) {
    parts.push(proj.name);
    if (proj.description) parts.push(proj.description);
    parts.push(...proj.techStack);
  }

  parts.push(...resume.certifications);

  return parts.join(' ');
}

// ─── Jaccard fallback ─────────────────────────────────────────────────────────

const STOP = new Set([
  'the', 'and', 'for', 'are', 'this', 'that', 'with', 'from', 'have', 'will',
  'your', 'their', 'they', 'what', 'when', 'where', 'which', 'while', 'team',
  'work', 'role', 'about', 'into', 'also', 'more', 'some', 'our', 'you', 'we',
  'be', 'to', 'of', 'in', 'a', 'is', 'it', 'at', 'on', 'do', 'or', 'an',
  'by', 'as', 'up', 'if', 'so', 'not', 'but', 'all', 'new', 'can',
  'has', 'had', 'was', 'its', 'one', 'may', 'use', 'set', 'any',
]);

function tokenise(text: string): Set<string> {
  const tokens = text.toLowerCase().match(/\b[a-z][a-z0-9]{2,}\b/g) ?? [];
  return new Set(tokens.filter((t) => !STOP.has(t) && t.length >= 4));
}

function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

// ─── Public scorer ────────────────────────────────────────────────────────────

export function computeSemanticScore(
  resume: ResumeJson,
  jdText: string,
  resumeEmbedding?: number[],
  jdEmbedding?: number[],
): SemanticScoreResult {
  // Path A: embedding cosine similarity (preferred)
  if (
    resumeEmbedding &&
    jdEmbedding &&
    resumeEmbedding.length > 0 &&
    resumeEmbedding.length === jdEmbedding.length
  ) {
    const rawScore = dotProduct(resumeEmbedding, jdEmbedding);
    const score = Math.round(Math.max(0, Math.min(100, rawScore * 100)));
    return {
      score,
      breakdown: { method: 'embedding', raw_score: parseFloat(rawScore.toFixed(4)) },
    };
  }

  // Path B: extended Jaccard on cleaned token sets
  const resumeText = resumeToText(resume);
  const resumeTokens = tokenise(resumeText);
  const jdTokens = tokenise(jdText);

  const rawScore = jaccardSimilarity(resumeTokens, jdTokens);
  // Scale: jaccard=0.10 → 40, jaccard=0.20 → 80, jaccard=0.25 → 100
  const score = Math.min(100, Math.round(rawScore * 400));

  return {
    score,
    breakdown: { method: 'jaccard', raw_score: parseFloat(rawScore.toFixed(4)) },
  };
}
