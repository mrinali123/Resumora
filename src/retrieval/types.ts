import type { ChunkType } from '../chunkers/types';

// ─── Search Query ─────────────────────────────────────────────────────────────

export interface SearchFilters {
  chunkTypes?: ChunkType[];
  sourceType?: 'resume' | 'job' | 'all';
}

export interface SearchQuery {
  query: string;
  filters?: SearchFilters;
  limit?: number;
  offset?: number;
  minSimilarity?: number;
}

// ─── Search Results ───────────────────────────────────────────────────────────

export interface SearchResultSource {
  type: 'resume' | 'job';
  id: string;
  title: string;
  candidateName?: string | null;
  company?: string | null;
}

export interface SearchResult {
  chunkId: string;
  content: string;
  chunkType: ChunkType;
  // 1 - cosine_distance; range [0, 1]. OpenAI embeddings are unit vectors,
  // so cosine_distance = 1 - dot_product → similarity = dot_product.
  similarity: number;
  source: SearchResultSource;
  metadata: Record<string, unknown>;
}

// ─── Similar Resumes ──────────────────────────────────────────────────────────

export interface SimilarResume {
  resumeId: string;
  title: string;
  candidateName: string | null;
  // Highest similarity among all chunks matched between the two resumes
  maxSimilarity: number;
  // Average similarity across matched chunks (proxy for overall profile match)
  avgSimilarity: number;
  matchedChunkCount: number;
}
