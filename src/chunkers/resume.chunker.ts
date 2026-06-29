// ─── Resume Chunker (section-based) ──────────────────────────────────────────
//
// Chunking strategy: one semantic unit → one chunk
//
// Why section-based rather than fixed-token-window?
//   Fixed windows break context at arbitrary byte offsets. A 200-token window
//   might split a single job entry in half, destroying the "company + role"
//   context the embedding model needs to understand seniority and domain.
//
//   Section-based chunking keeps EXPERIENCE entries intact, which gives much
//   better retrieval precision (a query for "Redis at a startup" returns the
//   right job entry, not a chunk that starts mid-bullet from an unrelated role).
//
// Why a separate FULL chunk?
//   Holistic resume-to-resume similarity (the /resumes/:id/similar endpoint)
//   needs a single vector that represents the whole candidate. The FULL chunk
//   (first 500 words) approximates this without the noise of individual sections.
//
// Phase 4: replace FULL chunk with an LLM-generated 3-sentence candidate summary
// for a much richer holistic embedding.

import type { Chunk, ChunkType, ChunkMetadata } from './types';
import type { EducationEntry, ExperienceEntry, ProjectEntry } from '../parser/types';

const MAX_FULL_WORDS = 500;   // cap FULL chunk so it fits in any embedding model
const MIN_CHUNK_WORDS = 5;    // discard trivially short / empty chunks

export interface ResumeChunkInput {
  extractedText: string;
  parsedData: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    skills: string[];
    education: EducationEntry[];
    experience: ExperienceEntry[];
    projects: ProjectEntry[];
    sectionMap?: Record<string, string>;
  } | null;
}

export function chunkResume(input: ResumeChunkInput): Chunk[] {
  const chunks: Chunk[] = [];
  let idx = 0;

  const { extractedText, parsedData } = input;
  const sections = parsedData?.sectionMap ?? {};

  // ── 1. HEADER ────────────────────────────────────────────────────────────
  const header = buildHeaderText(parsedData);
  if (words(header) >= MIN_CHUNK_WORDS) {
    chunks.push(make(idx++, 'HEADER', header, {}));
  }

  // ── 2. SUMMARY ───────────────────────────────────────────────────────────
  const summary = sections['SUMMARY']?.trim() ?? '';
  if (words(summary) >= MIN_CHUNK_WORDS) {
    chunks.push(make(idx++, 'SUMMARY', summary, {}));
  }

  // ── 3. SKILLS ────────────────────────────────────────────────────────────
  // Flat list → one chunk. Embedding models excel at skill-list similarity.
  const skills = parsedData?.skills;
  if (skills && skills.length > 0) {
    const text = `Technical Skills: ${skills.join(', ')}`;
    chunks.push(make(idx++, 'SKILLS', text, { skillCount: skills.length }));
  } else if (sections['SKILLS']?.trim()) {
    chunks.push(make(idx++, 'SKILLS', sections['SKILLS'].trim(), {}));
  }

  // ── 4. EXPERIENCE — one chunk per job entry ───────────────────────────────
  // Granularity: one embedding per role means "Redis caching at startup" retrieves
  // exactly that entry, not a mixed blob of 5 companies.
  const experiences = parsedData?.experience;
  if (experiences && experiences.length > 0) {
    for (const exp of experiences) {
      const text = formatExperience(exp);
      if (words(text) >= MIN_CHUNK_WORDS) {
        chunks.push(
          make(idx++, 'EXPERIENCE', text, {
            company: exp.company,
            title: exp.role ?? undefined,
          }),
        );
      }
    }
  } else if (sections['EXPERIENCE']?.trim()) {
    chunks.push(make(idx++, 'EXPERIENCE', sections['EXPERIENCE'].trim(), {}));
  }

  // ── 5. EDUCATION — one chunk per school entry ─────────────────────────────
  const educations = parsedData?.education;
  if (educations && educations.length > 0) {
    for (const edu of educations) {
      const text = formatEducation(edu);
      if (words(text) >= MIN_CHUNK_WORDS) {
        chunks.push(
          make(idx++, 'EDUCATION', text, {
            institution: edu.institution,
            degree: edu.degree ?? undefined,
          }),
        );
      }
    }
  } else if (sections['EDUCATION']?.trim()) {
    chunks.push(make(idx++, 'EDUCATION', sections['EDUCATION'].trim(), {}));
  }

  // ── 6. PROJECTS — one chunk per project ──────────────────────────────────
  const projects = parsedData?.projects;
  if (projects && projects.length > 0) {
    for (const proj of projects) {
      const text = formatProject(proj);
      if (words(text) >= MIN_CHUNK_WORDS) {
        chunks.push(
          make(idx++, 'PROJECT', text, {
            projectName: proj.name,
            technologies: proj.techStack,
          }),
        );
      }
    }
  } else if (sections['PROJECTS']?.trim()) {
    chunks.push(make(idx++, 'PROJECT', sections['PROJECTS'].trim(), {}));
  }

  // ── 7. CERTIFICATIONS ────────────────────────────────────────────────────
  const certs = sections['CERTIFICATIONS']?.trim() ?? '';
  if (words(certs) >= MIN_CHUNK_WORDS) {
    chunks.push(make(idx++, 'CERTIFICATIONS', certs, {}));
  }

  // ── 8. FULL — holistic representation (first N words) ────────────────────
  // Used by /resumes/:id/similar to find whole-resume neighbours.
  // Capped to MAX_FULL_WORDS to stay within embedding model context limits.
  const fullWords = extractedText.split(/\s+/).filter(Boolean);
  const fullText = fullWords.slice(0, MAX_FULL_WORDS).join(' ');
  if (words(fullText) >= MIN_CHUNK_WORDS) {
    chunks.push(make(idx++, 'FULL', fullText, {}));
  }

  return chunks;
}

// ─── Formatters ───────────────────────────────────────────────────────────────
// Prose format produces better embeddings than raw JSON because models are
// trained on natural language, not structured key-value text.

function buildHeaderText(pd: ResumeChunkInput['parsedData']): string {
  if (!pd) return '';
  const parts: string[] = [];
  if (pd.name) parts.push(`Candidate: ${pd.name}`);
  if (pd.email) parts.push(`Email: ${pd.email}`);
  if (pd.phone) parts.push(`Phone: ${pd.phone}`);
  return parts.join('\n');
}

function formatExperience(exp: ExperienceEntry): string {
  const header = `${exp.role ?? 'Role'} at ${exp.company}${exp.duration ? ` (${exp.duration})` : ''}`;
  const bullets = (exp.bulletPoints ?? []).map((b) => `- ${b}`).join('\n');
  return bullets ? `${header}\n${bullets}` : header;
}

function formatEducation(edu: EducationEntry): string {
  const degree = edu.degree ?? 'Degree';
  const period = edu.startYear || edu.endYear
    ? ` (${edu.startYear ?? '?'} – ${edu.endYear ?? '?'})`
    : '';
  return `${degree} at ${edu.institution}${period}`;
}

function formatProject(proj: ProjectEntry): string {
  const lines = [`Project: ${proj.name}`];
  if (proj.techStack.length) lines.push(`Technologies: ${proj.techStack.join(', ')}`);
  if (proj.description) lines.push(proj.description);
  return lines.join('\n');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function tokens(text: string): number {
  return Math.ceil(words(text) * 1.35);
}

function make(index: number, type: ChunkType, content: string, metadata: ChunkMetadata): Chunk {
  return { index, type, content, wordCount: words(content), tokenEstimate: tokens(content), metadata };
}
