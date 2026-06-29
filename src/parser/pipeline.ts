// ─── Parse Pipeline ───────────────────────────────────────────────────────────
//
// Orchestrates the full deterministic + optional LLM parsing pipeline:
//
//   1. Clean raw text
//   2. NLP section detection  → SectionMap
//   3. Per-section extractors → raw structured data
//   4. Normalisation          → canonical skill names, dedup
//   5. Confidence scoring     → 0–1 score + human warnings
//   6. LLM cleanup (optional) → fills null fields if confidence < 0.60
//   7. Build final ResumeParseResult with null-safe field guarantees

import type { ResumeParseResult, ParseOptions, SectionMap } from './types';
import { cleanRawText } from './utils/text.utils';
import { extractSections } from './extractors/section.extractor';
import { extractContact } from './extractors/contact.extractor';
import { extractSkills } from './extractors/skills.extractor';
import { extractEducation } from './extractors/education.extractor';
import { extractExperience } from './extractors/experience.extractor';
import { extractProjects } from './extractors/projects.extractor';
import { extractCertifications } from './extractors/certifications.extractor';
import { computeConfidence, collectWarnings, LLM_TRIGGER_THRESHOLD } from './utils/confidence';
import { runLlmCleanup } from './llm/llm-cleanup';

const PARSER_VERSION = '3.0.0';

// ─── Public API ───────────────────────────────────────────────────────────────

export async function runPipeline(
  rawText: string,
  options: ParseOptions = {},
): Promise<ResumeParseResult> {
  const parsedAt = new Date().toISOString();
  const warnings: string[] = [];

  // ── Step 1: Normalise raw text ─────────────────────────────────────────────
  const cleanText = cleanRawText(rawText);

  if (!cleanText || cleanText.length < 50) {
    warnings.push('Resume text is too short — extraction may be incomplete');
  }

  // ── Step 2: NLP section detection ─────────────────────────────────────────
  const sectionMap: SectionMap = extractSections(cleanText);

  // ── Step 3: Per-section extraction ────────────────────────────────────────
  const contact = extractContact(sectionMap.CONTACT ?? cleanText.slice(0, 400));

  // For skills cross-body scan: give it the experience + projects text
  const supplementaryText = [
    sectionMap.EXPERIENCE ?? '',
    sectionMap.PROJECTS ?? '',
  ].join('\n');

  const skills = extractSkills(sectionMap.SKILLS ?? '', supplementaryText);

  const education = extractEducation(sectionMap.EDUCATION ?? '');
  const experience = extractExperience(sectionMap.EXPERIENCE ?? '');
  const projects = extractProjects(sectionMap.PROJECTS ?? '');

  // Certifications can appear in CERTIFICATIONS or AWARDS section
  const certifications = extractCertifications(
    [sectionMap.CERTIFICATIONS ?? '', sectionMap.AWARDS ?? ''].join('\n'),
  );

  // ── Step 4: Assemble partial result ───────────────────────────────────────
  let partial: Omit<ResumeParseResult, '_meta'> = {
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    skills,
    education,
    experience,
    projects,
    certifications,
  };

  // ── Step 5: Confidence scoring ────────────────────────────────────────────
  const confidenceScore = computeConfidence(partial);
  warnings.push(...collectWarnings(partial));

  // ── Step 6: Optional LLM cleanup ──────────────────────────────────────────
  let llmUsed = false;

  if (
    !options.skipLlm &&
    options.userId &&
    confidenceScore < LLM_TRIGGER_THRESHOLD
  ) {
    const cleanup = await runLlmCleanup(cleanText, partial, options.userId);
    partial = cleanup.result;
    llmUsed = cleanup.used;

    if (llmUsed) {
      warnings.push(
        `Deterministic confidence was ${confidenceScore.toFixed(2)} — LLM cleanup applied`,
      );
    }
  }

  // ── Step 7: Build final result ────────────────────────────────────────────
  // Null-safe: all array fields default to empty array, never undefined.
  return {
    name: partial.name ?? null,
    email: partial.email ?? null,
    phone: partial.phone ?? null,
    skills: partial.skills ?? [],
    education: partial.education ?? [],
    experience: partial.experience ?? [],
    projects: partial.projects ?? [],
    certifications: partial.certifications ?? [],

    _meta: {
      confidenceScore,
      parserVersion: PARSER_VERSION,
      parsedAt,
      sectionMap: serializeSectionMap(sectionMap),
      warnings,
      llmUsed,
    },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Strip undefined values and truncate large bodies to keep _meta lean.
function serializeSectionMap(sectionMap: SectionMap): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(sectionMap)) {
    if (value) {
      out[key] = value.length > 500 ? value.slice(0, 500) + '…' : value;
    }
  }
  return out;
}
