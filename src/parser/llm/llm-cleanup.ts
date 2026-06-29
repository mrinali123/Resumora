// ─── LLM Cleanup Layer ────────────────────────────────────────────────────────
//
// Optional enrichment pass triggered when deterministic confidence < 0.60.
//
// Design constraints:
//   - Only fills null/empty fields. Never overwrites a non-null deterministic result.
//   - Hard 8-second timeout; any failure returns the original partial result.
//   - Structured JSON output enforced via prompt — no markdown, no prose.
//   - Reuses the existing AIService infrastructure (provider routing, caching,
//     metrics) rather than making raw OpenAI calls.
//
// The prompt deliberately receives ONLY the missing fields to minimise token
// usage. Sending the full resume + "extract everything" is 5–10× more expensive
// and less reliable than targeted fill-in.

import { logger } from '../../utils/logger';
import type { ResumeParseResult } from '../types';

const LLM_TIMEOUT_MS = 8_000;
const PARSER_LLM_VERSION = 'parser-cleanup-v1';

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildCleanupPrompt(
  resumeText: string,
  missingFields: string[],
): string {
  return `You are a resume parser. Extract ONLY the following fields from the resume text below.
Return a single JSON object. Use null for any field you cannot find. No markdown, no explanation.

Fields to extract: ${missingFields.join(', ')}

JSON schema for each field:
- name: string | null
- email: string | null
- phone: string | null
- skills: string[] (technology names only, no soft skills)
- education: Array<{ institution: string, degree: string | null, startYear: string | null, endYear: string | null }>
- experience: Array<{ company: string, role: string | null, duration: string | null, bulletPoints: string[] }>
- projects: Array<{ name: string, description: string | null, techStack: string[] }>
- certifications: string[]

Resume text:
---
${resumeText.slice(0, 6000)}
---

Return ONLY the JSON object for the requested fields.`;
}

// ─── JSON extraction ──────────────────────────────────────────────────────────

function extractJsonFromResponse(raw: string): Record<string, unknown> | null {
  // Strip markdown code fences
  const stripped = raw.replace(/```(?:json)?\n?/gi, '').replace(/```/g, '').trim();

  // Find first { and last }
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end === -1) return null;

  try {
    return JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ─── Merge helper ─────────────────────────────────────────────────────────────
// Only fills in null/empty fields — deterministic results are never overwritten.

function mergeCleanupResult(
  base: Omit<ResumeParseResult, '_meta'>,
  llmResult: Record<string, unknown>,
): Omit<ResumeParseResult, '_meta'> {
  const merged = { ...base };

  if (!merged.name && typeof llmResult.name === 'string') {
    merged.name = llmResult.name;
  }
  if (!merged.email && typeof llmResult.email === 'string') {
    merged.email = llmResult.email;
  }
  if (!merged.phone && typeof llmResult.phone === 'string') {
    merged.phone = llmResult.phone;
  }
  if (merged.skills.length === 0 && Array.isArray(llmResult.skills)) {
    merged.skills = (llmResult.skills as unknown[])
      .filter((s): s is string => typeof s === 'string')
      .slice(0, 40);
  }
  if (merged.education.length === 0 && Array.isArray(llmResult.education)) {
    merged.education = (llmResult.education as unknown[])
      .filter((e): e is { institution: string } => !!e && typeof (e as { institution?: string }).institution === 'string')
      .map((e: unknown) => {
        const edu = e as Record<string, unknown>;
        return {
          institution: String(edu.institution ?? ''),
          degree: typeof edu.degree === 'string' ? edu.degree : null,
          startYear: typeof edu.startYear === 'string' ? edu.startYear : null,
          endYear: typeof edu.endYear === 'string' ? edu.endYear : null,
        };
      });
  }
  if (merged.experience.length === 0 && Array.isArray(llmResult.experience)) {
    merged.experience = (llmResult.experience as unknown[])
      .filter((e): e is { company: string } => !!e && typeof (e as { company?: string }).company === 'string')
      .map((e: unknown) => {
        const exp = e as Record<string, unknown>;
        return {
          company: String(exp.company ?? ''),
          role: typeof exp.role === 'string' ? exp.role : null,
          duration: typeof exp.duration === 'string' ? exp.duration : null,
          bulletPoints: Array.isArray(exp.bulletPoints)
            ? (exp.bulletPoints as unknown[]).filter((b): b is string => typeof b === 'string')
            : [],
        };
      });
  }
  if (merged.projects.length === 0 && Array.isArray(llmResult.projects)) {
    merged.projects = (llmResult.projects as unknown[])
      .filter((p): p is { name: string } => !!p && typeof (p as { name?: string }).name === 'string')
      .map((p: unknown) => {
        const proj = p as Record<string, unknown>;
        return {
          name: String(proj.name ?? ''),
          description: typeof proj.description === 'string' ? proj.description : null,
          techStack: Array.isArray(proj.techStack)
            ? (proj.techStack as unknown[]).filter((t): t is string => typeof t === 'string')
            : [],
        };
      });
  }
  if (merged.certifications.length === 0 && Array.isArray(llmResult.certifications)) {
    merged.certifications = (llmResult.certifications as unknown[])
      .filter((c): c is string => typeof c === 'string');
  }

  return merged;
}

// ─── Determine which fields need filling ─────────────────────────────────────

function getMissingFields(result: Omit<ResumeParseResult, '_meta'>): string[] {
  const missing: string[] = [];
  if (!result.name) missing.push('name');
  if (!result.email) missing.push('email');
  if (!result.phone) missing.push('phone');
  if (result.skills.length === 0) missing.push('skills');
  if (result.education.length === 0) missing.push('education');
  if (result.experience.length === 0) missing.push('experience');
  if (result.projects.length === 0) missing.push('projects');
  if (result.certifications.length === 0) missing.push('certifications');
  return missing;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function runLlmCleanup(
  resumeText: string,
  partial: Omit<ResumeParseResult, '_meta'>,
  userId: string,
): Promise<{ result: Omit<ResumeParseResult, '_meta'>; used: boolean }> {
  const missingFields = getMissingFields(partial);
  if (missingFields.length === 0) return { result: partial, used: false };

  try {
    // Lazy-import AIService to avoid circular deps and to let tests mock it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { aiService } = require('../../ai/ai.service') as {
      aiService: {
        run: (opts: {
          userId: string;
          endpoint: string;
          template: { build: (ctx: unknown) => Array<{ role: string; content: string }> };
          context: unknown;
          cacheInputs: Record<string, unknown>;
        }) => Promise<{ content: string }>;
      };
    };

    const prompt = buildCleanupPrompt(resumeText, missingFields);

    const result = await Promise.race([
      aiService.run({
        userId,
        endpoint: 'parser/llm-cleanup',
        template: {
          build: () => [
            {
              role: 'user',
              content: prompt,
            },
          ],
        },
        context: {},
        cacheInputs: {
          // Use a hash of the first 1000 chars + missing fields as cache key
          resumePrefix: resumeText.slice(0, 1000),
          missingFields,
          v: PARSER_LLM_VERSION,
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('LLM cleanup timeout')), LLM_TIMEOUT_MS),
      ),
    ]);

    const parsed = extractJsonFromResponse(result.content);
    if (!parsed) {
      logger.warn({ userId }, 'LLM cleanup returned non-parseable JSON');
      return { result: partial, used: false };
    }

    const merged = mergeCleanupResult(partial, parsed);
    return { result: merged, used: true };
  } catch (err) {
    // LLM cleanup is best-effort — any failure falls back gracefully
    logger.warn({ err, userId }, 'LLM cleanup failed — using deterministic result');
    return { result: partial, used: false };
  }
}
