// ─── RAG Context Builder ──────────────────────────────────────────────────────
//
// Assembles a token-budgeted context string from resume and job chunks.
// This is the core RAG component: never sends raw full text to the LLM.
//
// When embeddings are available:
//   - Scores each resume chunk against job requirement chunks via cosine similarity
//   - Returns the highest-relevance chunks within the token budget
//
// When embeddings are unavailable:
//   - Falls back to priority-ordered chunk type selection
//
// Token estimation: Math.ceil(charCount / 4) — ~4 chars/token average for English.
// Conservative side, which is intentional: we'd rather slightly under-use the
// budget than over-run it and hit API limits.

import { prisma } from '../../config/database';
import { dotProduct, parseVectorString } from '../../analysis/skills.utils';
import { env } from '../../config/env';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContextBlock {
  source: 'resume' | 'job';
  chunkType: string;
  content: string;
  metadata: Record<string, unknown>;
  tokenEstimate: number;
  relevanceScore?: number;
}

export interface BuiltContext {
  resumeBlocks: ContextBlock[];
  jobBlocks: ContextBlock[];
  resumeText: string;   // concatenated, header-labelled resume blocks
  jobText: string;      // concatenated, header-labelled job blocks
  totalTokens: number;
  truncated: boolean;
  hasEmbeddings: boolean;
}

// Which chunk types to prefer for resume/job contexts — ordered by priority
const RESUME_CHUNK_PRIORITY = ['SUMMARY', 'SKILLS', 'EXPERIENCE', 'PROJECT', 'CERTIFICATIONS', 'EDUCATION', 'HEADER'];
const JOB_CHUNK_PRIORITY = ['REQUIREMENTS', 'RESPONSIBILITIES', 'QUALIFICATIONS', 'FULL', 'ABOUT_COMPANY', 'GENERAL'];

// ─── Raw DB row types ─────────────────────────────────────────────────────────

interface ChunkRow {
  id: string;
  chunk_type: string;
  content: string;
  metadata: unknown;
  word_count: number;
  token_estimate: number;
}

interface EmbeddedChunkRow extends ChunkRow {
  embedding_text: string;
}

// ─── ContextBuilder ───────────────────────────────────────────────────────────

export class ContextBuilder {
  async build(
    resumeId: string,
    jobId: string,
    options: {
      resumeChunkTypes?: string[];
      jobChunkTypes?: string[];
      tokenBudget?: number;
    } = {},
  ): Promise<BuiltContext> {
    const budget = options.tokenBudget ?? env.AI_CONTEXT_TOKEN_BUDGET;
    const resumeTypes = options.resumeChunkTypes ?? RESUME_CHUNK_PRIORITY;
    const jobTypes = options.jobChunkTypes ?? JOB_CHUNK_PRIORITY;

    // Load chunks (check if embeddings exist without loading vectors first)
    const [hasResumeEmbedding, hasJobEmbedding] = await Promise.all([
      this.hasEmbeddings('resume', resumeId),
      this.hasEmbeddings('job', jobId),
    ]);
    const hasEmbeddings = hasResumeEmbedding && hasJobEmbedding;

    let resumeBlocks: ContextBlock[];
    let jobBlocks: ContextBlock[];

    if (hasEmbeddings) {
      [resumeBlocks, jobBlocks] = await Promise.all([
        this.loadRankedByEmbedding('resume', resumeId, jobId, resumeTypes, Math.floor(budget * 0.6)),
        this.loadByPriority('job', jobId, jobTypes, Math.floor(budget * 0.4)),
      ]);
    } else {
      [resumeBlocks, jobBlocks] = await Promise.all([
        this.loadByPriority('resume', resumeId, resumeTypes, Math.floor(budget * 0.6)),
        this.loadByPriority('job', jobId, jobTypes, Math.floor(budget * 0.4)),
      ]);
    }

    const totalTokens = [...resumeBlocks, ...jobBlocks].reduce(
      (s, b) => s + b.tokenEstimate, 0,
    );
    const truncated = totalTokens >= budget;

    return {
      resumeBlocks,
      jobBlocks,
      resumeText: this.renderBlocks(resumeBlocks),
      jobText: this.renderBlocks(jobBlocks),
      totalTokens,
      truncated,
      hasEmbeddings,
    };
  }

  // ── Embedding-ranked loading ────────────────────────────────────────────────

  private async loadRankedByEmbedding(
    source: 'resume' | 'job',
    sourceId: string,
    jobId: string,
    chunkTypes: string[],
    tokenBudget: number,
  ): Promise<ContextBlock[]> {
    const table = source === 'resume' ? 'resume_chunks' : 'job_chunks';
    const idCol = source === 'resume' ? 'resume_id' : 'job_id';
    const typeArr = `{${chunkTypes.join(',')}}`;

    const [sourceRows, jobReqRows] = await Promise.all([
      prisma.$queryRawUnsafe<EmbeddedChunkRow[]>(`
        SELECT id, chunk_type, content, metadata, word_count, token_estimate,
               embedding::text AS embedding_text
        FROM ${table}
        WHERE ${idCol} = $1 AND embedding IS NOT NULL
          AND chunk_type = ANY($2::text[])
      `, sourceId, typeArr),
      // Load job requirement chunks as scoring references
      prisma.$queryRawUnsafe<EmbeddedChunkRow[]>(`
        SELECT id, chunk_type, content, metadata, word_count, token_estimate,
               embedding::text AS embedding_text
        FROM job_chunks
        WHERE job_id = $1 AND embedding IS NOT NULL
          AND chunk_type = ANY($2::text[])
      `, jobId, `{REQUIREMENTS,RESPONSIBILITIES,FULL}`),
    ]);

    if (jobReqRows.length === 0) {
      // Fall back to priority ordering if job has no requirement embeddings
      return this.loadByPriority(source, sourceId, chunkTypes, tokenBudget);
    }

    const jobEmbeddings = jobReqRows.map((r) => parseVectorString(r.embedding_text));

    // Score each source chunk by max similarity to any job requirement chunk
    const scored = sourceRows.map((r) => {
      const emb = parseVectorString(r.embedding_text);
      const maxSim = Math.max(...jobEmbeddings.map((je) => dotProduct(emb, je)));
      return { row: r, score: maxSim };
    });

    scored.sort((a, b) => b.score - a.score);

    return this.fillBudget(
      scored.map(({ row, score }) => this.rowToBlock(source, row, score)),
      tokenBudget,
    );
  }

  // ── Priority-ordered loading (no embeddings) ────────────────────────────────

  private async loadByPriority(
    source: 'resume' | 'job',
    sourceId: string,
    chunkTypes: string[],
    tokenBudget: number,
  ): Promise<ContextBlock[]> {
    const table = source === 'resume' ? 'resume_chunks' : 'job_chunks';
    const idCol = source === 'resume' ? 'resume_id' : 'job_id';
    const typeArr = `{${chunkTypes.join(',')}}`;

    const rows = await prisma.$queryRawUnsafe<ChunkRow[]>(`
      SELECT id, chunk_type, content, metadata, word_count, token_estimate
      FROM ${table}
      WHERE ${idCol} = $1 AND chunk_type = ANY($2::text[])
      ORDER BY chunk_index
    `, sourceId, typeArr);

    // Sort by our priority list
    const priorityMap = new Map(chunkTypes.map((t, i) => [t, i]));
    rows.sort((a, b) =>
      (priorityMap.get(a.chunk_type) ?? 99) - (priorityMap.get(b.chunk_type) ?? 99),
    );

    return this.fillBudget(rows.map((r) => this.rowToBlock(source, r)), tokenBudget);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private fillBudget(blocks: ContextBlock[], budget: number): ContextBlock[] {
    const result: ContextBlock[] = [];
    let used = 0;
    for (const block of blocks) {
      if (used + block.tokenEstimate > budget) break;
      result.push(block);
      used += block.tokenEstimate;
    }
    return result;
  }

  private rowToBlock(
    source: 'resume' | 'job',
    row: ChunkRow,
    relevanceScore?: number,
  ): ContextBlock {
    return {
      source,
      chunkType: row.chunk_type,
      content: row.content,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      tokenEstimate: row.token_estimate || Math.ceil(row.content.length / 4),
      relevanceScore,
    };
  }

  private renderBlocks(blocks: ContextBlock[]): string {
    return blocks
      .map((b) => `[${b.chunkType}]\n${b.content}`)
      .join('\n\n');
  }

  private async hasEmbeddings(source: 'resume' | 'job', id: string): Promise<boolean> {
    if (source === 'resume') {
      const r = await prisma.resumeChunk.findFirst({
        where: { resumeId: id, embeddedAt: { not: null } },
        select: { id: true },
      });
      return r !== null;
    }
    const r = await prisma.jobChunk.findFirst({
      where: { jobId: id, embeddedAt: { not: null } },
      select: { id: true },
    });
    return r !== null;
  }
}

export const contextBuilder = new ContextBuilder();
