import OpenAI from 'openai';
import { env } from '../../config/env';
import type { AIProvider, AIMessage, CompletionOptions, CompletionResult } from './types';

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  readonly defaultModel: string;

  private client: OpenAI;

  constructor() {
    if (!env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    this.defaultModel = env.OPENAI_CHAT_MODEL;
  }

  async complete(messages: AIMessage[], options: CompletionOptions = {}): Promise<CompletionResult> {
    const model = options.model ?? this.defaultModel;

    const response = await this.client.chat.completions.create({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: options.maxTokens ?? env.AI_MAX_RESPONSE_TOKENS,
      temperature: options.temperature ?? 0.7,
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
