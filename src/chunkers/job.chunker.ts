// ─── Job Description Chunker (pattern + sliding-window hybrid) ───────────────
//
// Strategy: detect semantic sections by header pattern matching, then apply
// a sliding-window split to any section that exceeds MAX_SECTION_WORDS.
//
// Why hybrid (not pure section-based)?
//   Job descriptions are far less structurally consistent than resumes.
//   A JD from one company is a bulleted list; another is free-form prose.
//   Pattern matching handles ~80 % of cases; the sliding window ensures
//   nothing is silently truncated for the remaining 20 %.
//
// Why a FULL chunk?
//   Mirrors the resume FULL chunk so the retrieval layer can compute
//   resume↔job similarity using the same vector space.

import type { Chunk, ChunkType, ChunkMetadata } from './types';

const MAX_SECTION_WORDS = 400;   // split sections larger than this
const OVERLAP_WORDS = 50;        // words of overlap between sliding chunks
const MIN_CHUNK_WORDS = 10;      // skip trivial/empty sections
const MAX_FULL_WORDS = 400;      // cap the FULL chunk

// Maps a detected section name to the canonical ChunkType
const SECTION_PATTERNS: Array<{ type: ChunkType; pattern: RegExp }> = [
  {
    type: 'RESPONSIBILITIES',
    pattern: /^(responsibilities|duties|what\s+you.ll\s+do|role\s+overview|key\s+responsibilities|your\s+role)/i,
  },
  {
    type: 'REQUIREMENTS',
    pattern: /^(requirements?|minimum\s+qualifications?|what\s+we.re\s+looking\s+for|must\s+have|basic\s+qualifications?)/i,
  },
  {
    type: 'QUALIFICATIONS',
    pattern: /^(preferred\s+qualifications?|nice\s+to\s+have|bonus|plus|additional\s+qualifications?)/i,
  },
  {
    type: 'ABOUT_COMPANY',
    pattern: /^(about\s+(us|the\s+company|company)|who\s+we\s+are|company\s+overview|our\s+story)/i,
  },
  {
    type: 'GENERAL',
    pattern: /^(benefits?|perks?|what\s+we\s+offer|compensation|total\s+rewards|why\s+join)/i,
  },
];

export interface JobChunkInput {
  title: string;
  company?: string | null;
  content: string;
}

export function chunkJobDescription(input: JobChunkInput): Chunk[] {
  const { title, company, content } = input;
  const chunks: Chunk[] = [];
  let idx = 0;

  // ── 1. FULL chunk ─────────────────────────────────────────────────────────
  // Prefix with the job title and company so the embedding captures role context.
  const header = company ? `${title} at ${company}` : title;
  const bodyWords = content.split(/\s+/).filter(Boolean).slice(0, MAX_FULL_WORDS);
  const fullText = `${header}\n\n${bodyWords.join(' ')}`;
  if (wc(fullText) >= MIN_CHUNK_WORDS) {
    chunks.push(make(idx++, 'FULL', fullText, {}));
  }

  // ── 2. Section-based chunks ───────────────────────────────────────────────
  const sections = detectSections(content);

  for (const [sectionType, sectionText] of Object.entries(sections)) {
    const trimmed = sectionText.trim();
    if (wc(trimmed) < MIN_CHUNK_WORDS) continue;

    // Large sections get a sliding window so no content is silently dropped.
    const subChunks = splitWithOverlap(trimmed, MAX_SECTION_WORDS, OVERLAP_WORDS);

    for (const sub of subChunks) {
      if (wc(sub) >= MIN_CHUNK_WORDS) {
        chunks.push(make(idx++, sectionType as ChunkType, sub, {}));
      }
    }
  }

  return chunks;
}

// ─── Section detection ────────────────────────────────────────────────────────

function detectSections(content: string): Record<string, string> {
  const result: Record<string, string> = { GENERAL: '' };
  let current = 'GENERAL';

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    let matched = false;

    for (const { type, pattern } of SECTION_PATTERNS) {
      if (pattern.test(line)) {
        current = type;
        result[current] ??= '';
        matched = true;
        break;
      }
    }

    if (!matched) {
      result[current] += rawLine + '\n';
    }
  }

  return result;
}

// Sliding window over words. Produces overlapping sub-chunks so context
// is not lost at boundaries. Overlap = leading words from the previous chunk.
function splitWithOverlap(text: string, maxWords: number, overlapWords: number): string[] {
  const wordList = text.split(/\s+/).filter(Boolean);
  if (wordList.length <= maxWords) return [text];

  const result: string[] = [];
  let start = 0;

  while (start < wordList.length) {
    const end = Math.min(start + maxWords, wordList.length);
    result.push(wordList.slice(start, end).join(' '));
    if (end === wordList.length) break;
    start += maxWords - overlapWords;
  }

  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function wc(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function tokens(text: string): number {
  return Math.ceil(wc(text) * 1.35);
}

function make(index: number, type: ChunkType, content: string, metadata: ChunkMetadata): Chunk {
  return { index, type, content, wordCount: wc(content), tokenEstimate: tokens(content), metadata };
}
