// ─── EmbeddingProvider interface ─────────────────────────────────────────────
//
// Provider-agnostic contract that every embedding backend must fulfil.
//
// Design decisions:
//   - `embed` always takes an array so the batch path is the primary path.
//     Single-text embedding is just a convenience wrapper in EmbeddingService.
//   - `modelId` and `dimensions` are read-only properties (not method parameters)
//     so the retrieval layer can record which model produced a given vector
//     without knowing which provider class is in use.
//   - The interface is intentionally minimal — retry, rate-limiting, and
//     batching logic live in EmbeddingService, not in the provider. This keeps
//     provider implementations focused and easy to swap.
//
// To add a new provider (Gemini, Cohere, Ollama, etc.):
//   1. Create src/embeddings/providers/<name>.provider.ts
//   2. Implement this interface
//   3. Add a case to the factory in src/embeddings/index.ts

export interface EmbeddingProvider {
  readonly modelId: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}
