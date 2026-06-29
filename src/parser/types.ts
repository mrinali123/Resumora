// ─── Parser v3 Types ──────────────────────────────────────────────────────────
//
// This is the canonical output contract for the new modular parsing engine.
// All field-level nullability is intentional: parsers must never throw on
// missing data — they return null so callers can decide how to handle gaps.

export type SectionType =
  | 'CONTACT'
  | 'SUMMARY'
  | 'EXPERIENCE'
  | 'EDUCATION'
  | 'SKILLS'
  | 'PROJECTS'
  | 'CERTIFICATIONS'
  | 'AWARDS'
  | 'PUBLICATIONS'
  | 'LANGUAGES'
  | 'UNKNOWN';

// Scored candidate for a section header line.
export interface SectionCandidate {
  lineIndex: number;
  line: string;
  sectionType: SectionType;
  score: number; // 0–1
}

// Map of section type → raw body text extracted between headers.
export type SectionMap = Partial<Record<SectionType, string>>;

// ─── Output sub-types ─────────────────────────────────────────────────────────

export interface EducationEntry {
  institution: string;
  degree: string | null;
  startYear: string | null;
  endYear: string | null;
}

export interface ExperienceEntry {
  company: string;
  role: string | null;
  duration: string | null; // raw date string, e.g. "Jan 2021 – Present"
  bulletPoints: string[];
}

export interface ProjectEntry {
  name: string;
  description: string | null;
  techStack: string[];
}

// ─── Top-level result ─────────────────────────────────────────────────────────

export interface ResumeParseResult {
  name: string | null;
  email: string | null;
  phone: string | null;
  skills: string[];
  education: EducationEntry[];
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  certifications: string[];

  // Internal diagnostics — not exposed in API response body by default.
  _meta: ParseMeta;
}

export interface ParseMeta {
  confidenceScore: number; // 0–1; < 0.6 triggers LLM cleanup
  parserVersion: string;
  parsedAt: string;
  sectionMap: Record<string, string>; // for audit/debugging
  warnings: string[];
  llmUsed: boolean;
}

// Options passed to the pipeline entry point.
export interface ParseOptions {
  // When true, skip LLM cleanup even if confidence is low.
  skipLlm?: boolean;
  // The user's ID, required for LLM usage tracking.
  userId?: string;
}
