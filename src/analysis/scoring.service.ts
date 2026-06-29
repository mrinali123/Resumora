// ─── ScoringService ───────────────────────────────────────────────────────────
//
// Computes the five ATS component scores and aggregates them into an overall score.
//
// Design principles:
//   1. No magic numbers — every constant is in skills.constants.ts or defined
//      inline with an explanatory comment.
//   2. Each component score is independently testable (pure or near-pure functions).
//   3. Embedding-based scores degrade gracefully to keyword-based fallbacks when
//      the embedding API is unavailable.
//   4. Weights are a parameter, not a hardcoded constant, so the Phase 5 UI
//      can expose sliders without touching this file.
//
// Scoring formulas (all scores in [0, 100]):
//
//   Skill Score:
//     (exact_matched + semantic_matched × 0.75) / total_required × 100
//     → 0.75 partial credit for semantic matches (related but not exact)
//
//   Experience Score (with embeddings):
//     weighted_top_k_mean(similarity of each EXPERIENCE chunk to best JD chunk) × 100
//     → "best-of" approach: one exceptional match outweighs many mediocre ones
//
//   Experience Score (without embeddings — fallback):
//     (shared_skills between experience text and job requirements) / total_job_skills × 100
//
//   Education Score:
//     table-lookup by shortfall between candidate and required level
//     → 100 if candidate meets requirement; decreasing if below
//
//   Keyword Score:
//     covered_tech_keywords / total_job_tech_keywords × 100
//
//   Semantic Score (with embeddings):
//     FULL-chunk cosine similarity × 100
//     → holistic document-level alignment
//
//   Overall Score:
//     Σ component_score_i × weight_i

import { prisma } from '../config/database';
import {
  DEFAULT_SCORING_WEIGHTS,
  EDU_LEVEL_RANK,
  EDU_SHORTFALL_SCORES,
  TECH_SKILLS,
  type ScoringWeights,
  type EducationLevel,
} from './skills.constants';
import {
  extractSkillsFromText,
  findExactMatches,
  detectEducationLevel,
  dotProduct,
  parseVectorString,
  clampScore,
  weightedTopKMean,
} from './skills.utils';
import type { ComponentScores, KeywordCoverage } from './types';
import type { Education } from '../parsers/types';

// ─── Embedded chunk row from raw SQL ─────────────────────────────────────────

interface EmbeddedChunkRow {
  id: string;
  chunk_type: string;
  content: string;
  metadata: unknown;
  embedding_text: string;
}

interface ParsedChunk {
  id: string;
  chunkType: string;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
}

// ─── ScoringService ───────────────────────────────────────────────────────────

export class ScoringService {
  // ── Public interface ───────────────────────────────────────────────────────

  async computeAllScores(params: {
    resumeId: string;
    jobId: string;
    resumeSkills: string[];
    matchingSkills: string[];
    semanticMatches: string[];
    requiredSkills: string[];
    resumeEducation: Education[];
    jobContent: string;
    resumeFullText: string;
    hasEmbeddings: boolean;
  }): Promise<ComponentScores> {
    const [skill, education, keyword] = [
      this.computeSkillScore(
        params.matchingSkills,
        params.semanticMatches,
        params.requiredSkills,
      ),
      this.computeEducationScore(params.resumeEducation, params.jobContent),
      this.computeKeywordCoverage(params.resumeFullText, params.jobContent).coverageRate * 100,
    ];

    const [experience, semantic] = await Promise.all([
      params.hasEmbeddings
        ? this.computeExperienceScoreViaEmbeddings(params.resumeId, params.jobId)
        : this.computeExperienceScoreFallback(params.resumeFullText, params.jobContent),
      params.hasEmbeddings
        ? this.computeSemanticScore(params.resumeId, params.jobId)
        : 0,
    ]);

    return {
      skill: clampScore(skill),
      experience: clampScore(experience),
      education: clampScore(education),
      keyword: clampScore(keyword),
      semantic: clampScore(semantic),
    };
  }

  computeOverallScore(
    scores: ComponentScores,
    weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS,
  ): number {
    const raw =
      scores.skill * weights.skills +
      scores.experience * weights.experience +
      scores.education * weights.education +
      scores.keyword * weights.keyword +
      scores.semantic * weights.semantic;

    return clampScore(raw);
  }

  computeKeywordCoverage(resumeText: string, jobText: string): KeywordCoverage {
    // Scan the JD for known tech keywords; check which appear in the resume
    const jobKeywords = extractSkillsFromText(jobText);
    const covered = findExactMatches(
      extractSkillsFromText(resumeText).concat(
        // Also scan the full resume text for skills not in ParsedResume.skills
        extractSkillsFromText(resumeText),
      ),
      jobKeywords,
    );
    const missing = jobKeywords.filter((k) => !covered.includes(k));

    return {
      covered: [...new Set(covered)],
      missing: [...new Set(missing)],
      coverageRate: jobKeywords.length > 0 ? covered.length / jobKeywords.length : 1,
    };
  }

  // ── Skill score ────────────────────────────────────────────────────────────

  computeSkillScore(
    matchingSkills: string[],      // exact matches
    semanticMatches: string[],     // semantic-only matches (already excluded from exact)
    requiredSkills: string[],
  ): number {
    const total = requiredSkills.length;
    if (total === 0) return 100; // no requirements → full score

    // Exact match: 1.0 credit; semantic match: 0.75 credit
    const rawScore =
      (matchingSkills.length * 1.0 + semanticMatches.length * 0.75) / total * 100;

    return rawScore;
  }

  // ── Education score ────────────────────────────────────────────────────────

  computeEducationScore(candidateEducation: Education[], jobContent: string): number {
    const requiredLevel = detectEducationLevel(jobContent);

    if (requiredLevel === 'none') return 100; // no requirement → full score

    // Derive candidate's highest education level
    const candidateLevel = candidateEducation
      .map((e) => detectEducationLevel([e.degree, e.field].filter(Boolean).join(' ')))
      .reduce<EducationLevel>(
        (best, level) =>
          EDU_LEVEL_RANK[level] > EDU_LEVEL_RANK[best] ? level : best,
        'none',
      );

    const shortfall = Math.max(
      0,
      EDU_LEVEL_RANK[requiredLevel as EducationLevel] -
        EDU_LEVEL_RANK[candidateLevel],
    );

    return EDU_SHORTFALL_SCORES[shortfall] ?? 20;
  }

  // ── Experience score ───────────────────────────────────────────────────────

  // Primary path: uses pre-computed pgvector embeddings.
  // Weighted top-K approach: the best matching experience entry matters most.
  private async computeExperienceScoreViaEmbeddings(
    resumeId: string,
    jobId: string,
  ): Promise<number> {
    const [resumeExpChunks, jobReqChunks] = await Promise.all([
      this.loadChunks('resume', resumeId, ['EXPERIENCE', 'SKILLS']),
      this.loadChunks('job', jobId, ['REQUIREMENTS', 'RESPONSIBILITIES', 'FULL']),
    ]);

    if (resumeExpChunks.length === 0 || jobReqChunks.length === 0) {
      return 0;
    }

    // For each resume experience chunk, find its maximum similarity to any job chunk
    const chunkScores = resumeExpChunks.map((rc) =>
      Math.max(...jobReqChunks.map((jc) => dotProduct(rc.embedding, jc.embedding))),
    );

    // Use weighted top-3 to reward depth in the most relevant roles
    return weightedTopKMean(chunkScores, 3) * 100;
  }

  // Fallback: keyword overlap when embeddings are unavailable.
  private computeExperienceScoreFallback(resumeText: string, jobText: string): number {
    const resumeSkills = new Set(
      extractSkillsFromText(resumeText).map((s) => s.toLowerCase()),
    );
    const jobSkills = extractSkillsFromText(jobText);

    if (jobSkills.length === 0) return 50; // unknown requirement → neutral score

    const overlap = jobSkills.filter((s) => resumeSkills.has(s.toLowerCase())).length;
    return (overlap / jobSkills.length) * 100;
  }

  // ── Semantic score ─────────────────────────────────────────────────────────

  // FULL-chunk dot product → holistic document-level alignment.
  private async computeSemanticScore(resumeId: string, jobId: string): Promise<number> {
    const [resumeFull, jobFull] = await Promise.all([
      this.loadChunks('resume', resumeId, ['FULL']),
      this.loadChunks('job', jobId, ['FULL']),
    ]);

    if (resumeFull.length === 0 || jobFull.length === 0) return 0;

    return dotProduct(resumeFull[0].embedding, jobFull[0].embedding) * 100;
  }

  // ── DB helper ──────────────────────────────────────────────────────────────

  // Loads chunks with their parsed embeddings via raw SQL.
  // Table and id column are derived from `sourceType` — never user-controlled.
  async loadChunks(
    sourceType: 'resume' | 'job',
    sourceId: string,
    chunkTypes: string[],
  ): Promise<ParsedChunk[]> {
    const table = sourceType === 'resume' ? 'resume_chunks' : 'job_chunks';
    const idCol = sourceType === 'resume' ? 'resume_id' : 'job_id';
    const typeArr = `{${chunkTypes.join(',')}}`;

    const rows = await prisma.$queryRawUnsafe<EmbeddedChunkRow[]>(`
      SELECT id, chunk_type, content, metadata, embedding::text AS embedding_text
      FROM ${table}
      WHERE ${idCol} = $1
        AND embedding IS NOT NULL
        AND chunk_type = ANY($2::text[])
      ORDER BY chunk_index
    `, sourceId, typeArr);

    return rows.map((r) => ({
      id: r.id,
      chunkType: r.chunk_type,
      content: r.content,
      embedding: parseVectorString(r.embedding_text),
      metadata: (r.metadata as Record<string, unknown>) ?? {},
    }));
  }
}

export const scoringService = new ScoringService();
