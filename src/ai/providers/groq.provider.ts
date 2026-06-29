// Groq runs an OpenAI-compatible REST API, so we reuse the openai package by
// pointing it at Groq's base URL. No new dependency needed.
import OpenAI from 'openai';
import { env } from '../../config/env';
import type { AIProvider, AIMessage, CompletionOptions, CompletionResult } from './types';

export class GroqProvider implements AIProvider {
  readonly name = 'groq';
  readonly defaultModel: string;

  private client: OpenAI;

  constructor() {
    if (!env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY is not set');
    }
    this.client = new OpenAI({
      apiKey: env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    });
    this.defaultModel = env.GROQ_MODEL;
  }

  async complete(messages: AIMessage[], options: CompletionOptions = {}): Promise<CompletionResult> {
    const model = options.model ?? this.defaultModel;

    const response = await this.client.chat.completions.create({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: options.maxTokens ?? env.AI_MAX_RESPONSE_TOKENS,
      temperature: options.temperature ?? 0.7,
      // Groq supports response_format: json_object for most models
      ...(options.responseFormat === 'json_object'
        ? { response_format: { type: 'json_object' as const } }
        : {}),
    });

    const choice = response.choices[0];
    const usage = response.usage;

    return {
      content: choice?.message?.content ?? '',
      usage: {
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
      },
      model,
      provider: this.name,
    };
  }
}
