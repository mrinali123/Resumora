// ─── StrengthService ──────────────────────────────────────────────────────────
//
// Two kinds of strength analysis:
//
//   1. Job-relative strength (findStrengthsForJob):
//      Ranks resume chunks by cosine similarity to the job's requirement chunks.
//      "Which parts of this resume are most relevant to this specific role?"
//      Phase 5: attach LLM explanations to each strength item.
//
//   2. Intrinsic resume strength (computeResumeStrength):
//      Ranks resume sections by their inherent quality / depth.
//      "How strong is this resume, independent of any job description?"
//      Signals: skill count, experience duration cues, seniority markers,
//               technology count in projects, description richness.

import {
  dotProduct,
  parseVectorString,
  clampScore,
} from './skills.utils';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import type { StrengthItem, IntrinsicStrengthItem, ResumeStrength } from './types';

// Seniority keywords that indicate higher-value experience entries
const SENIORITY_TERMS = [
  'senior', 'lead', 'principal', 'staff', 'director', 'vp', 'vice president',
  'head of', 'chief', 'architect', 'manager', 'founder', 'co-founder',
];

// ─── Raw DB types ─────────────────────────────────────────────────────────────

interface EmbeddedChunkRow {
  id: string;
  chunk_type: string;
  content: string;
  metadata: unknown;
  embedding_text: string;
}

interface PlainChunkRow {
  id: string;
  chunk_type: string;
  content: string;
  metadata: unknown;
}

// ─── StrengthService ──────────────────────────────────────────────────────────

export class StrengthService {
  // ── Job-relative strengths ─────────────────────────────────────────────────

  async findStrengthsForJob(
    resumeId: string,
    jobId: string,
    topN = 3,
    hasEmbeddings = false,
  ): Promise<StrengthItem[]> {
    // Without embeddings the embedding column may not even exist — skip straight
    // to the intrinsic-strength fallback rather than letting the SQL crash.
    if (!hasEmbeddings) {
      return (await this.computeResumeStrength(resumeId)).strongestExperience
        .slice(0, topN)
        .map((s) => ({
          chunkType: s.chunkType,
          content: s.content,
          relevanceScore: s.strengthScore / 100,
          metadata: s.metadata,
        }));
    }

    // Load all non-FULL resume chunks (FULL is too generic to be a useful "strength")
    const [resumeRows, jobRows] = await Promise.all([
      this.loadEmbeddedChunks('resume', resumeId, ['EXPERIENCE', 'SKILLS', 'PROJECT', 'SUMMARY']),
      this.loadEmbeddedChunks('job', jobId, ['REQUIREMENTS', 'RESPONSIBILITIES', 'FULL']),
    ]);

    if (resumeRows.length === 0 || jobRows.length === 0) {
      // Embedding fallback: score by intrinsic strength instead
      return (await this.computeResumeStrength(resumeId)).strongestExperience
        .slice(0, topN)
        .map((s) => ({
          chunkType: s.chunkType,
          content: s.content,
          relevanceScore: s.strengthScore / 100,
          metadata: s.metadata,
        }));
    }

    // For each resume chunk, compute its max similarity to any job requirement chunk
    const scored = resumeRows.map((rc) => {
      const maxSim = Math.max(
        ...jobRows.map((jc) => dotProduct(rc.embedding, jc.embedding)),
      );
      return {
        chunkType: rc.chunk_type,
        content: rc.content,
        relevanceScore: maxSim,
        metadata: (rc.metadata as Record<string, unknown>) ?? {},
      };
    });

    return scored
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, topN);
  }

  // ── Intrinsic resume strength (job-agnostic) ───────────────────────────────

  async computeResumeStrength(resumeId: string): Promise<ResumeStrength> {
    const rows = await prisma.$queryRawUnsafe<PlainChunkRow[]>(`
      SELECT id, chunk_type, content, metadata
      FROM resume_chunks
      WHERE resume_id = $1
      ORDER BY chunk_index
    `, resumeId);

    const expChunks = rows.filter((r) => r.chunk_type === 'EXPERIENCE');
    const projChunks = rows.filter((r) => r.chunk_type === 'PROJECT');
    const skillChunk = rows.find((r) => r.chunk_type === 'SKILLS');

    const scoredExp = expChunks.map((c) => ({
      chunkType: c.chunk_type,
      content: c.content,
      strengthScore: this.scoreExperience(c.content),
      metadata: (c.metadata as Record<string, unknown>) ?? {},
    }));

    const scoredProj = projChunks.map((c) => ({
      chunkType: c.chunk_type,
      content: c.content,
      strengthScore: this.scoreProject(c.content),
      metadata: (c.metadata as Record<string, unknown>) ?? {},
    }));

    scoredExp.sort((a, b) => b.strengthScore - a.strengthScore);
    scoredProj.sort((a, b) => b.strengthScore - a.strengthScore);

    const strongestSkills = this.extractStrongestSkills(skillChunk?.content ?? '');

    const overallStrengthScore = this.computeOverallStrengthScore(
      scoredExp,
      scoredProj,
      strongestSkills,
    );

    return {
      strongestSkills,
      strongestExperience: scoredExp.slice(0, 3),
      strongestProjects: scoredProj.slice(0, 3),
      overallStrengthScore,
    };
  }

  // ── Intrinsic scoring helpers ──────────────────────────────────────────────

  private scoreExperience(content: string): number {
    const lower = content.toLowerCase();
    let score = 0;

    // Seniority signal (0–30 points)
    if (SENIORITY_TERMS.some((term) => lower.includes(term))) score += 30;
    else if (lower.includes('engineer') || lower.includes('developer')) score += 15;

    // Bullet richness (0–30 points): each bullet line contributes
    const bulletCount = (content.match(/^[-•*]\s/gm) ?? []).length;
    score += Math.min(30, bulletCount * 5);

    // Quantified achievements (0–20 points): numbers and percentages
    const hasMetrics = /\d+[%x×]|\$[\d,]+|\d+[kKmMbB]/.test(content);
    if (hasMetrics) score += 20;

    // Duration signal (0–20 points): "present" implies current role
    const isCurrent = /present|current/i.test(content);
    if (isCurrent) score += 10;
    if (/\d{4}/.test(content)) score += 10; // has year references

    return clampScore(score);
  }

  private scoreProject(content: string): number {
    const lower = content.toLowerCase();
    let score = 0;

    // Technology breadth (0–40 points)
    const techPattern = /\b[A-Z][a-zA-Z.+#]+\b/g;
    const techMatches = content.match(techPattern) ?? [];
    score += Math.min(40, techMatches.length * 5);

    // Description richness (0–30 points): word count proxy
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    score += Math.min(30, Math.floor(wordCount / 5));

    // Has URL (0–10 points)
    if (/https?:\/\/|github\.com|gitlab\.com/i.test(content)) score += 10;

    // Quantified impact (0–20 points)
    if (/\d+[%x×]|\d+[kKmMbB]|users?|requests?\/s/i.test(content)) score += 20;

    return clampScore(score);
  }

  private extractStrongestSkills(skillsContent: string): string[] {
    if (!skillsContent) return [];
    // Skills chunk format: "Technical Skills: TypeScript, React, ..."
    const match = skillsContent.match(/(?:Technical Skills:|Skills:)\s*(.*)/i);
    const raw = match ? match[1] : skillsContent;
    return raw
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 10); // top 10 as displayed
  }

  private computeOverallStrengthScore(
    exp: IntrinsicStrengthItem[],
    proj: IntrinsicStrengthItem[],
    skills: string[],
  ): number {
    const expScore = exp.length > 0
      ? exp.reduce((s, e) => s + e.strengthScore, 0) / exp.length
      : 0;
    const projScore = proj.length > 0
      ? proj.reduce((s, p) => s + p.strengthScore, 0) / proj.length
      : 0;
    const skillScore = Math.min(100, skills.length * 5);

    return clampScore(expScore * 0.5 + projScore * 0.3 + skillScore * 0.2);
  }

  // ── DB helper ──────────────────────────────────────────────────────────────

  private async loadEmbeddedChunks(
    sourceType: 'resume' | 'job',
    sourceId: string,
    chunkTypes: string[],
  ) {
    const table = sourceType === 'resume' ? 'resume_chunks' : 'job_chunks';
    const idCol = sourceType === 'resume' ? 'resume_id' : 'job_id';
    const typeArr = `{${chunkTypes.join(',')}}`;

    try {
      return await prisma.$queryRawUnsafe<(EmbeddedChunkRow & { embedding: number[] })[]>(`
        SELECT id, chunk_type, content, metadata, embedding::text AS embedding_text
        FROM ${table}
        WHERE ${idCol} = $1
          AND embedding IS NOT NULL
          AND chunk_type = ANY($2::text[])
      `, sourceId, typeArr).then((rows) =>
        rows.map((r) => ({
          ...r,
          embedding: parseVectorString(r.embedding_text),
        })),
      );
    } catch (err) {
      // The embedding column may not exist if pgvector is not installed.
      // Return empty so the caller falls back to intrinsic strength scoring.
      logger.warn({ err, table }, 'loadEmbeddedChunks: falling back — embedding column unavailable');
      return [];
    }
  }
}

export const strengthService = new StrengthService();
