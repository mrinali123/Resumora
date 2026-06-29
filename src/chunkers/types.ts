// ─── Chunk Types ──────────────────────────────────────────────────────────────
//
// Defined as a const array so:
//   1. TypeScript derives ChunkType from a single source of truth
//   2. Zod can reference the tuple directly: z.enum(CHUNK_TYPES)
//   3. The search API can filter by type without an extra lookup table

export const CHUNK_TYPES = [
  // Resume chunk types
  'HEADER',         // Candidate name + contact info
  'SUMMARY',        // Professional summary / objective
  'SKILLS',         // All technical skills as a single flat list
  'EXPERIENCE',     // One chunk per job entry (company + title + bullets)
  'EDUCATION',      // One chunk per school entry
  'PROJECT',        // One chunk per project
  'CERTIFICATIONS', // Certifications & licenses
  'FULL',           // First 500 words of the full document (holistic similarity)
  // Job description chunk types
  'REQUIREMENTS',    // Must-have qualifications
  'RESPONSIBILITIES',// Day-to-day duties
  'QUALIFICATIONS',  // Nice-to-have / preferred
  'ABOUT_COMPANY',   // Company overview
  'GENERAL',         // Catch-all for unrecognised sections (benefits, etc.)
] as const;

export type ChunkType = (typeof CHUNK_TYPES)[number];

// ─── Chunk metadata ───────────────────────────────────────────────────────────
//
// Stored in resume_chunks.metadata / job_chunks.metadata (JSONB).
// Having structured metadata lets the retrieval layer filter and explain results
// without re-parsing the chunk content.

export interface ChunkMetadata {
  // EXPERIENCE-specific
  company?: string;
  title?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  // EDUCATION-specific
  institution?: string;
  degree?: string;
  gpa?: string;
  // PROJECT-specific
  projectName?: string;
  technologies?: string[];
  // SKILLS-specific
  skillCount?: number;
}

// ─── Chunk ────────────────────────────────────────────────────────────────────

export interface Chunk {
  index: number;
  type: ChunkType;
  content: string;
  wordCount: number;
  // Rough estimate: wordCount × 1.35 avoids a runtime tiktoken call.
  // Accurate enough for deciding whether to split large sections.
  tokenEstimate: number;
  metadata: ChunkMetadata;
}
