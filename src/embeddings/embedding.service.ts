import type { EmbeddingProvider } from './types';
import { logger } from '../utils/logger';

// ─── EmbeddingService ─────────────────────────────────────────────────────────
//
// Thin orchestration layer between the pipeline and the embedding provider.
// Responsibilities:
//   - Single-text shorthand (embedOne)
//   - Batching large arrays to respect API rate limits (embedBatch)
//   - Progress reporting so the upload pipeline can log intermediate progress
//     for large resumes with many chunks
//
// NOT responsible for:
//   - Retry / back-off (add an interceptor on the provider if needed)
//   - Caching (add a Redis wrapper around the provider for Phase 4)
//   - Vector storage (callers do that via raw SQL after receiving the vectors)

export class EmbeddingService {
  constructor(private readonly provider: EmbeddingProvider) {}

  get modelId(): string {
    return this.provider.modelId;
  }

  get dimensions(): number {
    return this.provider.dimensions;
  }

  async embedOne(text: string): Promise<number[]> {
    const [embedding] = await this.provider.embed([text]);
    return embedding;
  }

  // Splits `texts` into sub-arrays of `batchSize` and awaits them sequentially
  // to avoid triggering OpenAI's rate limit. Parallel batching is possible but
  // requires exponential back-off; sequential is safe for Phase 3 workloads.
  //
  // Phase 4: add a token-bucket or p-limit concurrency wrapper here.
  async embedBatch(
    texts: string[],
    batchSize?: number,
    onProgress?: (done: number, total: number) => void,
  ): Promise<number[][]> {
    const bs = batchSize ?? 100;
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += bs) {
      const batch = texts.slice(i, i + bs);
      const embeddings = await this.provider.embed(batch);
      results.push(...embeddings);
      onProgress?.(Math.min(i + bs, texts.length), texts.length);
    }

    logger.debug(
      { model: this.modelId, total: texts.length },
      'Batch embedding complete',
    );

    return results;
  }
}
