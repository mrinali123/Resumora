// ─── GapAnalysisService ───────────────────────────────────────────────────────
//
// Compares what the resume offers against what the job requires.
// Three-pass approach:
//   Pass 1 — Exact match (normalised string comparison + alias resolution)
//   Pass 2 — Semantic match (embedding cosine similarity, only if available)
//   Pass 3 — Priority classification (required vs preferred section)
//
// Phase 5 hook: `skillGaps` is structured for the LLM to generate targeted
// learning-path recommendations ordered by `priority`.

import {
  findExactMatches,
  extractSkillsFromText,
  dotProduct,
  parseVectorString,
} from './skills.utils';
import {
  SEMANTIC_MATCH_THRESHOLD,
  SEMANTIC_PARTIAL_THRESHOLD,
} from './skills.constants';
import type { EmbeddingService } from '../embeddings';
import type { GapAnalysisResult, SkillGap } from './types';

export interface GapAnalysisInput {
  // From ParsedResume.skills (or extracted from full text as fallback)
  resumeSkills: string[];
  // Skills found in REQUIREMENTS / main body of JD (must-have)
  requiredSkills: string[];
  // Skills found in QUALIFICATIONS / NICE-TO-HAVE sections (preferred)
  preferredSkills: string[];
  // Optional — used only if provided to avoid redundant embeddings
  embeddingService?: EmbeddingService | null;
}

export class GapAnalysisService {
  async findGaps(input: GapAnalysisInput): Promise<GapAnalysisResult> {
    const { resumeSkills, requiredSkills, preferredSkills, embeddingService } = input;

    // ── Pass 1: Exact matching ────────────────────────────────────────────────
    const exactMatchedRequired = findExactMatches(resumeSkills, requiredSkills);
    const exactMatchedPreferred = findExactMatches(resumeSkills, preferredSkills);

    const exactMissingRequired = requiredSkills.filter(
      (s) => !exactMatchedRequired.includes(s),
    );
    const exactMissingPreferred = preferredSkills.filter(
      (s) => !exactMatchedPreferred.includes(s),
    );

    // ── Pass 2: Semantic matching for unmatched required skills ───────────────
    // Only runs if embedding service is available AND there are unmatched skills.
    let semanticMatches: string[] = [];
    const skillGaps: SkillGap[] = [];

    if (embeddingService && exactMissingRequired.length > 0 && resumeSkills.length > 0) {
      semanticMatches = await this.findSemanticMatches(
        exactMissingRequired,
        resumeSkills,
        embeddingService,
        skillGaps,
      );
    }

    // All remaining required skills (not exact, not semantic) are hard gaps
    const hardMissingRequired = exactMissingRequired.filter(
      (s) => !semanticMatches.includes(s),
    );

    // Add hard gaps to skillGaps with HIGH priority
    for (const skill of hardMissingRequired) {
      skillGaps.push({ skill, priority: 'HIGH' });
    }
    // Preferred gaps are MEDIUM priority
    for (const skill of exactMissingPreferred) {
      skillGaps.push({ skill, priority: 'MEDIUM' });
    }

    // Sort: HIGH → MEDIUM → LOW, then alphabetically within each tier
    skillGaps.sort((a, b) => {
      const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      const pd = priorityOrder[a.priority] - priorityOrder[b.priority];
      return pd !== 0 ? pd : a.skill.localeCompare(b.skill);
    });

    return {
      matchingSkills: [
        ...new Set([...exactMatchedRequired, ...exactMatchedPreferred, ...semanticMatches]),
      ],
      missingRequiredSkills: hardMissingRequired,
      missingPreferredSkills: exactMissingPreferred,
      semanticMatches,
      skillGaps,
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async findSemanticMatches(
    missingSkills: string[],
    resumeSkills: string[],
    embeddingService: EmbeddingService,
    skillGaps: SkillGap[], // mutated in-place with semantic match entries
  ): Promise<string[]> {
    // Embed skills in context to improve semantic matching accuracy.
    // "proficiency in {skill}" gives the model more signal than a bare keyword.
    const missingPhrases = missingSkills.map((s) => `proficiency in ${s}`);
    const resumePhrases = resumeSkills.map((s) => `proficiency in ${s}`);

    const [missingEmbeddings, resumeEmbeddings] = await Promise.all([
      embeddingService.embedBatch(missingPhrases),
      embeddingService.embedBatch(resumePhrases),
    ]);

    const matched: string[] = [];

    for (let i = 0; i < missingSkills.length; i++) {
      const missingEmb = missingEmbeddings[i];
      let maxSim = 0;

      for (const resumeEmb of resumeEmbeddings) {
        const sim = dotProduct(missingEmb, resumeEmb);
        if (sim > maxSim) maxSim = sim;
      }

      if (maxSim >= SEMANTIC_MATCH_THRESHOLD) {
        // Strong semantic match — treat as covered with partial note
        matched.push(missingSkills[i]);
        skillGaps.push({
          skill: missingSkills[i],
          priority: 'LOW',
          semanticSimilarity: maxSim,
        });
      } else if (maxSim >= SEMANTIC_PARTIAL_THRESHOLD) {
        // Weak match — still listed as missing but with lower priority
        skillGaps.push({
          skill: missingSkills[i],
          priority: 'MEDIUM',
          semanticSimilarity: maxSim,
        });
      }
      // Below SEMANTIC_PARTIAL_THRESHOLD → hard gap; handled by caller
    }

    return matched;
  }
}

// ─── Job skill extraction ─────────────────────────────────────────────────────
// Separates required vs preferred skills from a job description by section type.

export interface JobSkills {
  required: string[];
  preferred: string[];
}

export function extractJobSkills(chunks: Array<{ chunkType: string; content: string }>): JobSkills {
  const requiredChunkTypes = new Set(['REQUIREMENTS', 'RESPONSIBILITIES', 'FULL', 'GENERAL']);
  const preferredChunkTypes = new Set(['QUALIFICATIONS']);

  const requiredText = chunks
    .filter((c) => requiredChunkTypes.has(c.chunkType))
    .map((c) => c.content)
    .join('\n');

  const preferredText = chunks
    .filter((c) => preferredChunkTypes.has(c.chunkType))
    .map((c) => c.content)
    .join('\n');

  return {
    required: extractSkillsFromText(requiredText),
    preferred: extractSkillsFromText(preferredText),
  };
}

export const gapAnalysisService = new GapAnalysisService();
