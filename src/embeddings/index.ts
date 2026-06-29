// ─── Embedding factory ────────────────────────────────────────────────────────
//
// Returns a singleton EmbeddingService or null if no API key is configured.
//
// Null → the pipeline still runs (chunks are stored without vectors) but the
// search endpoint returns 503 with a clear "configure OPENAI_API_KEY" message.
//
// Why a factory function and not a top-level singleton?
//   Top-level module evaluation runs before dotenv.config() in some test
//   environments. A function call defers evaluation to first use, by which point
//   env has been populated.

import { env } from '../config/env';
import { OpenAIEmbeddingProvider } from './providers/openai.provider';
import { EmbeddingService } from './embedding.service';
import { logger } from '../utils/logger';

let _service: EmbeddingService | null = null;

export function getEmbeddingService(): EmbeddingService | null {
  if (!env.OPENAI_API_KEY) return null;

  if (!_service) {
    const provider = new OpenAIEmbeddingProvider(
      env.OPENAI_API_KEY,
      env.EMBEDDING_MODEL,
      env.EMBEDDING_DIMENSIONS,
    );
    _service = new EmbeddingService(provider);
    logger.info(
      { model: env.EMBEDDING_MODEL, dimensions: env.EMBEDDING_DIMENSIONS },
      'Embedding service initialized',
    );
  }

  return _service;
}

export { EmbeddingService } from './embedding.service';
export type { EmbeddingProvider } from './types';
