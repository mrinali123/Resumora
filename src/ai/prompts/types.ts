// ─── Prompt Template Interface ────────────────────────────────────────────────
//
// Every prompt in the system is a versioned, typed template.
// Versioning matters: when you change a prompt, bump its version so cached
// responses from the old version are not returned under the new one.
// The cache key includes the prompt version, so old entries expire naturally.

import type { AIMessage } from '../providers/types';

export interface PromptTemplate<TContext = Record<string, unknown>> {
  readonly name: string;
  // Bump when the prompt content changes. Format: 'MAJOR.MINOR'
  readonly version: string;
  readonly description: string;
  // How long to cache responses for this prompt (seconds)
  readonly cacheTtlSeconds: number;
  // Upper bound on output tokens for cost estimation
  readonly estimatedOutputTokens: number;
  build(context: TContext): AIMessage[];
}
