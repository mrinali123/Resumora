// ─── AIService ────────────────────────────────────────────────────────────────
//
// Orchestrates every LLM request in the system:
//   1. Cache check   → return immediately if hit
//   2. Get provider  → fail fast with 503 if none configured
//   3. Retry loop    → exponential backoff (1s → 2s → 4s)
//   4. Fallback      → try secondary provider if primary exhausts retries
//   5. Parse JSON    → robust extraction from markdown/code blocks
//   6. Cache write   → async, non-blocking
//   7. Metrics write → fire-and-forget
//
// Every feature service calls this.run() — not the providers directly.
// Provider swaps, retry tuning, and caching policy changes happen here only.

import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { getPrimaryProvider, getFallbackProvider } from './providers/index';
import { aiResponseCache } from './cache/response-cache';
import { aiMetricsService } from './metrics/ai-metrics.service';
import type { AIMessage, CompletionOptions, TokenUsage, ZERO_USAGE } from './providers/types';
import type { PromptTemplate } from './prompts/types';

// Re-export for feature services
export { ZERO_USAGE } from './providers/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AIRunOptions<TContext, TResult> {
  userId: string;
  endpoint: string;
  template: PromptTemplate<TContext>;
  context: TContext;
  // Inputs that uniquely identify this request for cache key derivation
  cacheInputs: Record<string, unknown>;
  completionOptions?: CompletionOptions;
  // Called when cache is bypassed (e.g. forceRefresh = true)
  bypassCache?: boolean;
}

export interface AIRunResult<T> {
  data: T;
  cached: boolean;
  usage: TokenUsage;
}

// ─── AIService ────────────────────────────────────────────────────────────────

export class AIService {
  async run<TContext, TResult>(
    options: AIRunOptions<TContext, TResult>,
  ): Promise<AIRunResult<TResult>> {
    const {
      userId,
      endpoint,
      template,
      context,
      cacheInputs,
      completionOptions,
      bypassCache = false,
    } = options;

    // ── 1. Cache check ────────────────────────────────────────────────────────
    const cacheKey = aiResponseCache.buildKey({
      endpoint,
      promptVersion: template.version,
      ...cacheInputs,
    });

    if (!bypassCache) {
      const cached = await aiResponseCache.get<TResult>(cacheKey);
      if (cached !== null) {
        logger.debug({ endpoint, cacheKey }, 'AI cache hit');
        aiMetricsService.record({
          userId,
          endpoint,
          provider: 'cache',
          model: 'cache',
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          latencyMs: 0,
          cached: true,
          success: true,
        });
        return {
          data: cached,
          cached: true,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        };
      }
    }

    // ── 2. Provider check ─────────────────────────────────────────────────────
    const primaryProvider = getPrimaryProvider();
    if (!primaryProvider) {
      throw new AppError(
        `AI provider "${env.AI_PRIMARY_PROVIDER}" is not configured. ` +
        `Set the corresponding API key (OPENAI_API_KEY / GEMINI_API_KEY / GROQ_API_KEY).`,
        503,
      );
    }

    // ── 3. Build messages ─────────────────────────────────────────────────────
    const messages = template.build(context);
    const opts: CompletionOptions = {
      responseFormat: 'json_object',
      maxTokens: env.AI_MAX_RESPONSE_TOKENS,
      ...completionOptions,
    };

    // ── 4. Run with retry + fallback ──────────────────────────────────────────
    const startMs = Date.now();
    let completionResult;
    let usedProvider = primaryProvider.name;

    try {
      completionResult = await withRetry(
        () => primaryProvider.complete(messages, opts),
        env.AI_MAX_RETRIES,
        env.AI_RETRY_BASE_DELAY_MS,
      );
    } catch (primaryErr) {
      const fallback = getFallbackProvider();
      if (fallback) {
        logger.warn(
          { endpoint, primaryProvider: primaryProvider.name, fallbackProvider: fallback.name },
          'Primary AI provider failed — trying fallback',
        );
        try {
          completionResult = await withRetry(
            () => fallback.complete(messages, opts),
            1, // single attempt on fallback
            0,
          );
          usedProvider = fallback.name;
        } catch (fallbackErr) {
          const latencyMs = Date.now() - startMs;
          aiMetricsService.record({
            userId, endpoint, provider: fallback.name,
            model: fallback.defaultModel,
            promptTokens: 0, completionTokens: 0, totalTokens: 0,
            latencyMs, cached: false, success: false,
            errorMessage: (fallbackErr as Error).message,
          });
          throw new AppError('AI request failed on both primary and fallback providers', 503);
        }
      } else {
        const latencyMs = Date.now() - startMs;
        aiMetricsService.record({
          userId, endpoint, provider: primaryProvider.name,
          model: primaryProvider.defaultModel,
          promptTokens: 0, completionTokens: 0, totalTokens: 0,
          latencyMs, cached: false, success: false,
          errorMessage: (primaryErr as Error).message,
        });
        throw new AppError('AI request failed. Please try again shortly.', 503);
      }
    }

    const latencyMs = Date.now() - startMs;

    // ── 5. Parse response ─────────────────────────────────────────────────────
    const data = parseJSONResponse<TResult>(completionResult.content);

    // ── 6. Cache write (async, non-blocking) ──────────────────────────────────
    aiResponseCache
      .set(cacheKey, endpoint, data, template.cacheTtlSeconds)
      .catch(() => {});

    // ── 7. Metrics write (fire-and-forget) ────────────────────────────────────
    aiMetricsService.record({
      userId,
      endpoint,
      provider: usedProvider,
      model: completionResult.model,
      promptTokens: completionResult.usage.promptTokens,
      completionTokens: completionResult.usage.completionTokens,
      totalTokens: completionResult.usage.totalTokens,
      latencyMs,
      cached: false,
      success: true,
    });

    logger.info(
      {
        endpoint,
        provider: usedProvider,
        model: completionResult.model,
        latencyMs,
        tokens: completionResult.usage.totalTokens,
      },
      'AI request complete',
    );

    return { data, cached: false, usage: completionResult.usage };
  }
}

export const aiService = new AIService();

// ─── Utilities ────────────────────────────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  baseDelayMs: number,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      // Don't retry on 4xx client errors (bad request, auth failure, etc.)
      const status = (err as { status?: number }).status;
      if (status && status >= 400 && status < 500) throw err;
      if (attempt < maxAttempts - 1) {
        await sleep(baseDelayMs * 2 ** attempt);
      }
    }
  }
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Robust JSON extraction — LLMs sometimes wrap JSON in markdown code fences.
export function parseJSONResponse<T>(content: string): T {
  // 1. Direct parse
  try {
    return JSON.parse(content) as T;
  } catch {}

  // 2. Extract from ```json ... ``` or ``` ... ```
  const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as T;
    } catch {}
  }

  // 3. Extract first { ... } or [ ... ] block
  const objMatch = content.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[1]) as T;
    } catch {}
  }

  // 4. Give up — return the raw string as a best-effort "data" value.
  // The feature service's response schema will surface this gracefully.
  logger.warn({ contentSnippet: content.slice(0, 200) }, 'AI response JSON parse failed — returning raw');
  return { raw: content } as unknown as T;
}
