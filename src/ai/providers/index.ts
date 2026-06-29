// ─── Provider factory ─────────────────────────────────────────────────────────
//
// Returns a configured AIProvider instance for the given provider name.
// Returns null if the provider's API key is missing — callers handle gracefully.
//
// Providers are instantiated on demand (not singletons) so tests can control
// env vars without module-level side effects.

import { env } from '../../config/env';
import { OpenAIProvider } from './openai.provider';
import { GroqProvider } from './groq.provider';
import { GeminiProvider } from './gemini.provider';
import type { AIProvider } from './types';

type ProviderName = 'openai' | 'gemini' | 'groq';

function buildProvider(name: ProviderName): AIProvider | null {
  try {
    switch (name) {
      case 'openai': return new OpenAIProvider();
      case 'groq': return new GroqProvider();
      case 'gemini': return new GeminiProvider();
    }
  } catch {
    // API key missing — caller handles gracefully
    return null;
  }
}

export function getPrimaryProvider(): AIProvider | null {
  return buildProvider(env.AI_PRIMARY_PROVIDER as ProviderName);
}

export function getFallbackProvider(): AIProvider | null {
  if (!env.AI_FALLBACK_PROVIDER) return null;
  return buildProvider(env.AI_FALLBACK_PROVIDER as ProviderName);
}

export type { AIProvider };
