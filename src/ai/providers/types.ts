// ─── AI Provider Abstraction ──────────────────────────────────────────────────
//
// Thin interface that isolates the rest of the codebase from vendor SDKs.
// Adding a new provider = implement AIProvider + register in index.ts.
// No other file needs to change.

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  model?: string;
  maxTokens?: number;
  // 0.0 = deterministic, 1.0 = creative. Default: 0.7
  temperature?: number;
  // Request structured JSON output. Providers enforce this at the API level
  // when supported (OpenAI response_format, Gemini responseMimeType).
  // The prompt must still instruct the model to respond with JSON.
  responseFormat?: 'json_object' | 'text';
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface CompletionResult {
  content: string;
  usage: TokenUsage;
  model: string;
  provider: string;
}

export interface AIProvider {
  readonly name: string;
  readonly defaultModel: string;
  complete(messages: AIMessage[], options?: CompletionOptions): Promise<CompletionResult>;
}

export const ZERO_USAGE: TokenUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
};
