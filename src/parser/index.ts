// ─── Parser v3 Public API ─────────────────────────────────────────────────────
//
// The only import surface callers should use.
//
// Usage:
//   import { parseResume, parseResumeSync } from '../parser';
//
//   // Full pipeline (with optional LLM cleanup):
//   const result = await parseResume(text, { userId: req.user.id });
//
//   // Deterministic-only, synchronous wrapper for tests / workers:
//   const result = parseResumeSync(text);

export { runPipeline as parseResume } from './pipeline';
export type {
  ResumeParseResult,
  EducationEntry,
  ExperienceEntry,
  ProjectEntry,
  ParseMeta,
  ParseOptions,
  SectionMap,
  SectionType,
} from './types';

// Synchronous convenience wrapper — skips LLM, returns a resolved Promise.
// Useful in test fixtures and background workers where async overhead is unwanted.
import { runPipeline } from './pipeline';
import type { ResumeParseResult, ParseOptions } from './types';

export function parseResumeSync(
  rawText: string,
  options?: Omit<ParseOptions, 'userId'>,
): Promise<ResumeParseResult> {
  return runPipeline(rawText, { ...options, skipLlm: true });
}
