// ─── RetrievalService ─────────────────────────────────────────────────────────
//
// The core of the RAG retrieval pipeline. Converts a text query → embedding →
// pgvector nearest-neighbour search → ranked SearchResult[].
//
// Architecture notes:
//
//   1. All vector reads/writes use `$queryRawUnsafe` because Prisma does not
//      generate typed accessors for `Unsupported` fields. The raw SQL is safe
//      because all dynamic values are passed as numbered parameters ($1, $2 …).
//
//   2. Cosine similarity  = 1 - cosine_distance  = 1 - (embedding <=> query).
//      pgvector's <=> returns a distance (lower = more similar), so we invert
//      to get a score in [0, 1] where 1 is identical.
//
//   3. The chunkType filter uses ANY($N::text[]) with a PostgreSQL array literal
//      ('{SKILLS,EXPERIENCE}') to keep the parameterised SQL safe while still
//      supporting a variable-length IN list.
//
//   4. `findSimilarResumes` avoids a round-trip by using a CROSS JOIN subquery
//      to pull the target resume's representative embedding inside the DB, then
//      finding the nearest neighbours in a single query.
//
//   5. User-scoping: every query filters on user_id through the parent resume or
//      job_descriptions table. Users only ever see their own documents.
//
// Phase 4 hooks:
//   - Add a Redis cache: wrap `search()` with `cache.getOrSet(queryHash, fn)`.
//   - Move IVFFlat probes to a config variable to tune accuracy/speed.
//   - Re-rank results with a cross-encoder model for higher precision.

import { prisma } from '../config/database';
import { getEmbeddingService } from '../embeddings';
import { AppError } from '../utils/errors';
import { env } from '../config/env';
import type { SearchQuery, SearchResult, SimilarResume } from './types';
import type { ChunkType } from '../chunkers/types';

// ─── Raw DB row types ─────────────────────────────────────────────────────────
// These parallel the SELECT columns in each query. Having explicit types
// (rather than unknown) catches mismatches at compile time.

interface RawResumeRow {
  chunk_id: string;
  chunk_type: string;
  content: string;
  metadata: unknown;
  resume_id: string;
  resume_title: string;
  candidate_name: string | null;
  similarity: number;
}

interface RawJobRow {
  chunk_id: string;
  chunk_type: string;
  content: string;
  metadata: unknown;
  job_id: string;
  job_title: string;
  company: string | null;
  similarity: number;
}

interface RawSimilarRow {
  resume_id: string;
  title: string;
  candidate_name: string | null;
  max_similarity: number;
  avg_similarity: number;
  matched_chunk_count: bigint; // COUNT returns bigint in Prisma raw
}

// ─── RetrievalService ─────────────────────────────────────────────────────────

export class RetrievalService {
  // ── Semantic search ─────────────────────────────────────────────────────────

  async search(query: SearchQuery, userId: string): Promise<SearchResult[]> {
    const embeddingService = getEmbeddingService();
    if (!embeddingService) {
      throw new AppError(
        'Embedding service is not configured. Set OPENAI_API_KEY to enable semantic search.',
        503,
      );
    }

    const queryEmbedding = await embeddingService.embedOne(query.query);
    const vectorStr = toVectorLiteral(queryEmbedding);

    const limit = query.limit ?? env.SEARCH_TOP_K;
    const offset = query.offset ?? 0;
    const minSim = query.minSimilarity ?? env.SEARCH_MIN_SIMILARITY;
    const sourceType = query.filters?.sourceType ?? 'all';

    const [resumeRows, jobRows] = await Promise.all([
      sourceType === 'all' || sourceType === 'resume'
        ? this.searchResumeChunks(vectorStr, userId, minSim, limit, offset, query.filters?.chunkTypes)
        : Promise.resolve<RawResumeRow[]>([]),
      sourceType === 'all' || sourceType === 'job'
        ? this.searchJobChunks(vectorStr, userId, minSim, limit, offset, query.filters?.chunkTypes)
        : Promise.resolve<RawJobRow[]>([]),
    ]);

    const results: SearchResult[] = [
      ...resumeRows.map(toResumeResult),
      ...jobRows.map(toJobResult),
    ];

    // Re-rank merged results and apply final limit
    return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  }

  // ── Similar resumes ─────────────────────────────────────────────────────────

  async findSimilarResumes(
    resumeId: string,
    userId: string,
    limit = 5,
  ): Promise<SimilarResume[]> {
    // Strategy: pick the best available representative embedding for the target
    // resume (FULL > SKILLS > EXPERIENCE), then find other resumes whose chunks
    // are nearest to that vector. Group by resume and aggregate similarity.
    //
    // The CROSS JOIN subquery eliminates an app-layer round-trip: we never
    // materialise the target vector in Node — it stays inside Postgres.
    const rows = await prisma.$queryRawUnsafe<RawSimilarRow[]>(`
      SELECT
        r.id                                              AS resume_id,
        r.title,
        pr.candidate_name,
        MAX(1 - (rc.embedding <=> target.embedding))     AS max_similarity,
        AVG(1 - (rc.embedding <=> target.embedding))     AS avg_similarity,
        COUNT(DISTINCT rc.id)                             AS matched_chunk_count
      FROM resume_chunks rc
      CROSS JOIN (
        SELECT embedding
        FROM resume_chunks
        WHERE resume_id = $1
          AND embedding IS NOT NULL
          AND chunk_type IN ('FULL', 'SKILLS', 'EXPERIENCE')
        ORDER BY
          CASE chunk_type
            WHEN 'FULL'       THEN 0
            WHEN 'SKILLS'     THEN 1
            ELSE                   2
          END
        LIMIT 1
      ) target
      INNER JOIN resumes r      ON r.id = rc.resume_id
      LEFT  JOIN parsed_resumes pr ON pr.resume_id = r.id
      WHERE rc.embedding IS NOT NULL
        AND r.id       != $1
        AND r.user_id   = $2
        AND 1 - (rc.embedding <=> target.embedding) > $3
      GROUP BY r.id, r.title, pr.candidate_name
      ORDER BY max_similarity DESC
      LIMIT $4
    `, resumeId, userId, env.SEARCH_MIN_SIMILARITY, limit);

    if (rows.length === 0) {
      // Distinguish "no similar found" from "no embedding yet"
      const targetHasEmbedding = await prisma.resumeChunk.findFirst({
        where: { resumeId, embeddedAt: { not: null } },
        select: { id: true },
      });

      if (!targetHasEmbedding) {
        throw new AppError(
          'This resume has not been embedded yet. Upload it again with OPENAI_API_KEY configured.',
          422,
        );
      }
    }

    return rows.map((row) => ({
      resumeId: row.resume_id,
      title: row.title,
      candidateName: row.candidate_name,
      maxSimilarity: Number(row.max_similarity),
      avgSimilarity: Number(row.avg_similarity),
      matchedChunkCount: Number(row.matched_chunk_count),
    }));
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async searchResumeChunks(
    vectorStr: string,
    userId: string,
    minSimilarity: number,
    limit: number,
    offset: number,
    chunkTypes?: ChunkType[],
  ): Promise<RawResumeRow[]> {
    const { filter, params } = buildTypeFilter(chunkTypes, 6);

    return prisma.$queryRawUnsafe<RawResumeRow[]>(`
      SELECT
        rc.id                                       AS chunk_id,
        rc.chunk_type,
        rc.content,
        rc.metadata,
        r.id                                        AS resume_id,
        r.title                                     AS resume_title,
        pr.candidate_name,
        1 - (rc.embedding <=> $1::vector)           AS similarity
      FROM resume_chunks rc
      INNER JOIN resumes r      ON r.id = rc.resume_id
      LEFT  JOIN parsed_resumes pr ON pr.resume_id = r.id
      WHERE rc.embedding IS NOT NULL
        AND r.user_id = $2
        AND 1 - (rc.embedding <=> $1::vector) >= $3
        ${filter}
      ORDER BY rc.embedding <=> $1::vector
      LIMIT $4 OFFSET $5
    `, vectorStr, userId, minSimilarity, limit, offset, ...params);
  }

  private async searchJobChunks(
    vectorStr: string,
    userId: string,
    minSimilarity: number,
    limit: number,
    offset: number,
    chunkTypes?: ChunkType[],
  ): Promise<RawJobRow[]> {
    const { filter, params } = buildTypeFilter(chunkTypes, 6);

    return prisma.$queryRawUnsafe<RawJobRow[]>(`
      SELECT
        jc.id                                       AS chunk_id,
        jc.chunk_type,
        jc.content,
        jc.metadata,
        j.id                                        AS job_id,
        j.title                                     AS job_title,
        j.company,
        1 - (jc.embedding <=> $1::vector)           AS similarity
      FROM job_chunks jc
      INNER JOIN job_descriptions j ON j.id = jc.job_id
      WHERE jc.embedding IS NOT NULL
        AND j.user_id = $2
        AND 1 - (jc.embedding <=> $1::vector) >= $3
        ${filter}
      ORDER BY jc.embedding <=> $1::vector
      LIMIT $4 OFFSET $5
    `, vectorStr, userId, minSimilarity, limit, offset, ...params);
  }
}

export const retrievalService = new RetrievalService();

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Formats a JS number[] as the PostgreSQL vector literal '[0.1,0.2,...]'
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

// Builds a safe parameterised type filter clause.
// chunkTypes are validated by Zod against a fixed enum before reaching here,
// but we still use ANY($N::text[]) parameterisation for defence in depth.
function buildTypeFilter(
  chunkTypes: ChunkType[] | undefined,
  paramIndex: number,
): { filter: string; params: unknown[] } {
  if (!chunkTypes || chunkTypes.length === 0) {
    return { filter: '', params: [] };
  }
  // PostgreSQL text array literal: '{SKILLS,EXPERIENCE}'
  return {
    filter: `AND chunk_type = ANY($${paramIndex}::text[])`,
    params: [`{${chunkTypes.join(',')}}`],
  };
}

// ─── Result mappers ───────────────────────────────────────────────────────────

function toResumeResult(row: RawResumeRow): SearchResult {
  return {
    chunkId: row.chunk_id,
    content: row.content,
    chunkType: row.chunk_type as ChunkType,
    similarity: Number(row.similarity),
    source: {
      type: 'resume',
      id: row.resume_id,
      title: row.resume_title,
      candidateName: row.candidate_name,
    },
    metadata: (row.metadata && typeof row.metadata === 'object'
      ? row.metadata
      : {}) as Record<string, unknown>,
  };
}

function toJobResult(row: RawJobRow): SearchResult {
  return {
    chunkId: row.chunk_id,
    content: row.content,
    chunkType: row.chunk_type as ChunkType,
    similarity: Number(row.similarity),
    source: {
      type: 'job',
      id: row.job_id,
      title: row.job_title,
      company: row.company,
    },
    metadata: (row.metadata && typeof row.metadata === 'object'
      ? row.metadata
      : {}) as Record<string, unknown>,
  };
}
