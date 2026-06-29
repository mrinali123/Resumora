// Google Gemini via native fetch — no extra package required.
// Converts OpenAI-style messages to Gemini's content format.
import { env } from '../../config/env';
import type { AIProvider, AIMessage, CompletionOptions, CompletionResult } from './types';

// ─── Gemini REST types ────────────────────────────────────────────────────────

interface GeminiPart { text: string }
interface GeminiContent { role: 'user' | 'model'; parts: GeminiPart[] }

interface GeminiRequest {
  system_instruction?: { parts: GeminiPart[] };
  contents: GeminiContent[];
  generationConfig: {
    maxOutputTokens: number;
    temperature: number;
    responseMimeType?: string;
  };
}

interface GeminiResponse {
  candidates: Array<{
    content: { parts: GeminiPart[] };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

// ─── GeminiProvider ───────────────────────────────────────────────────────────

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  readonly defaultModel: string;
  private readonly apiKey: string;

  constructor() {
    if (!env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    this.apiKey = env.GEMINI_API_KEY;
    this.defaultModel = env.GEMINI_MODEL;
  }

  async complete(messages: AIMessage[], options: CompletionOptions = {}): Promise<CompletionResult> {
    const model = options.model ?? this.defaultModel;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

    const { systemInstruction, contents } = this.convertMessages(messages);

    const body: GeminiRequest = {
      contents,
      generationConfig: {
        maxOutputTokens: options.maxTokens ?? env.AI_MAX_RESPONSE_TOKENS,
        temperature: options.temperature ?? 0.7,
        ...(options.responseFormat === 'json_object'
          ? { responseMimeType: 'application/json' }
          : {}),
      },
    };

    if (systemInstruction) {
      body.system_instruction = { parts: [{ text: systemInstruction }] };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${errorText}`);
    }

    const data = (await res.json()) as GeminiResponse;
    const content = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
    const meta = data.usageMetadata;

    return {
      content,
      usage: {
        promptTokens: meta?.promptTokenCount ?? 0,
        completionTokens: meta?.candidatesTokenCount ?? 0,
        totalTokens: meta?.totalTokenCount ?? 0,
      },
      model,
      provider: this.name,
    };
  }

  private convertMessages(messages: AIMessage[]): {
    systemInstruction: string | null;
    contents: GeminiContent[];
  } {
    let systemInstruction: string | null = null;
    const contents: GeminiContent[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        // Gemini takes the first system message as system_instruction
        systemInstruction = (systemInstruction ?? '') + msg.content;
      } else {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }
    }

    // Gemini requires at least one user turn
    if (contents.length === 0) {
      contents.push({ role: 'user', parts: [{ text: 'Please proceed.' }] });
    }

    return { systemInstruction, contents };
  }
}
