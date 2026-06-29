import OpenAI from 'openai';
import type { EmbeddingProvider } from '../types';
import { logger } from '../../utils/logger';

// ─── OpenAI Embedding Provider ────────────────────────────────────────────────
//
// Model reference:
//   text-embedding-3-small — 1536 dims, $0.02/1M tokens (default)
//   text-embedding-3-large — 3072 dims, higher quality, ~5× cost
//
// Key behaviours:
//   - OpenAI embeddings are L2-normalised unit vectors, so cosine similarity
//     equals dot product. pgvector's <=> (cosine distance) is the right index op.
//   - The API returns results in the same order as the input array (enforced by
//     the `sort by index` step below, per the API contract).
//   - The `dimensions` parameter (text-embedding-3-* only) downsizes output via
//     Matryoshka representation learning. Changing dimensions after embeddings
//     are stored requires a full re-embed and a schema migration.

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly modelId: string;
  readonly dimensions: number;

  private client: OpenAI;

  constructor(apiKey: string, model = 'text-embedding-3-small', dimensions = 1536) {
    this.client = new OpenAI({ apiKey });
    this.modelId = model;
    this.dimensions = dimensions;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    logger.debug({ model: this.modelId, count: texts.length }, 'Requesting embeddings from OpenAI');

    const params: OpenAI.EmbeddingCreateParams = {
      model: this.modelId,
      input: texts,
    };

    // Only pass `dimensions` for models that support it (text-embedding-3-*).
    // Passing it to ada-002 returns a 400 error.
    if (this.dimensions !== 1536 && this.modelId.startsWith('text-embedding-3')) {
      params.dimensions = this.dimensions;
    }

    const response = await this.client.embeddings.create(params);

    // The API guarantees ordering by index, but we sort defensively.
    return response.data
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);
  }
}
