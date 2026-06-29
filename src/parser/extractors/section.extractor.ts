// ─── NLP Section Extractor ────────────────────────────────────────────────────
//
// Detects section boundaries using a multi-signal scoring approach rather than
// a hardcoded regex list. Each candidate line is scored across three axes:
//
//   1. Keyword score   (0.45) — weighted synonym matching
//   2. Structure score (0.35) — line length, casing, surrounding blank lines
//   3. Token similarity(0.20) — Jaccard overlap + per-token fuzzy distance
//
// Any line scoring ≥ HEADER_THRESHOLD (0.52) for any section type is treated
// as a section header. This handles abbreviated headers ("Work Exp"), verbose
// headers ("Areas of Technical Expertise"), and accented Unicode headers.

import type { SectionType, SectionMap, SectionCandidate } from '../types';
import {
  normaliseHeaderLine,
  tokenise,
  jaccardSimilarity,
  levenshtein,
  looksLikeHeader,
} from '../utils/text.utils';

// ─── Section knowledge base ───────────────────────────────────────────────────

interface SectionConfig {
  // Primary terms — exact match scores highest
  primary: string[];
  // Secondary terms — partial/synonym match
  synonyms: string[];
  // Token-level keyword hints for Jaccard scoring
  tokenHints: string[];
}

const SECTION_CONFIGS: Record<SectionType, SectionConfig> = {
  EXPERIENCE: {
    primary: ['experience', 'work experience', 'professional experience', 'employment history'],
    synonyms: [
      'work history', 'career history', 'employment', 'positions held',
      'professional background', 'career summary', 'work exp', 'prof experience',
      'job history', 'relevant experience', 'internship experience',
    ],
    tokenHints: ['work', 'experience', 'employment', 'career', 'professional', 'history'],
  },
  EDUCATION: {
    primary: ['education', 'educational background', 'academic background'],
    synonyms: [
      'academic qualifications', 'academic history', 'schooling', 'training',
      'education and training', 'qualifications', 'degrees', 'academic credentials',
      'formal education', 'academic record',
    ],
    tokenHints: ['education', 'academic', 'qualification', 'degree', 'school', 'university'],
  },
  SKILLS: {
    primary: ['skills', 'technical skills', 'core competencies'],
    synonyms: [
      'competencies', 'technologies', 'tech stack', 'expertise', 'proficiencies',
      'tools', 'skill set', 'technical proficiencies', 'areas of expertise',
      'key skills', 'core skills', 'technical expertise', 'programming skills',
      'software skills', 'hard skills', 'languages and technologies',
    ],
    tokenHints: ['skill', 'technical', 'technology', 'tool', 'competency', 'expertise', 'proficiency'],
  },
  PROJECTS: {
    primary: ['projects', 'personal projects', 'academic projects'],
    synonyms: [
      'side projects', 'notable projects', 'portfolio', 'project experience',
      'open source', 'github projects', 'software projects', 'key projects',
      'selected projects', 'technical projects', 'engineering projects',
    ],
    tokenHints: ['project', 'portfolio', 'open', 'source', 'github', 'build'],
  },
  SUMMARY: {
    primary: ['summary', 'professional summary', 'objective'],
    synonyms: [
      'career objective', 'about me', 'profile', 'overview', 'introduction',
      'professional profile', 'career summary', 'personal statement',
      'executive summary', 'professional objective', 'career profile',
    ],
    tokenHints: ['summary', 'objective', 'profile', 'about', 'overview', 'introduction'],
  },
  CERTIFICATIONS: {
    primary: ['certifications', 'certificates', 'licenses'],
    synonyms: [
      'licenses & certifications', 'professional certifications', 'credentials',
      'professional development', 'certification & training', 'awarded certifications',
      'professional training', 'achievements',
    ],
    tokenHints: ['certification', 'certificate', 'license', 'credential', 'training'],
  },
  AWARDS: {
    primary: ['awards', 'honors', 'achievements'],
    synonyms: [
      'awards and honors', 'recognition', 'accomplishments', 'honors & awards',
      'distinctions', 'accolades',
    ],
    tokenHints: ['award', 'honor', 'achievement', 'recognition', 'distinction'],
  },
  PUBLICATIONS: {
    primary: ['publications', 'papers', 'research'],
    synonyms: [
      'research papers', 'published works', 'research publications',
      'conference papers', 'journals',
    ],
    tokenHints: ['publication', 'paper', 'research', 'journal', 'conference'],
  },
  LANGUAGES: {
    primary: ['languages', 'spoken languages'],
    synonyms: ['language proficiency', 'language skills', 'fluency'],
    tokenHints: ['language', 'spoken', 'fluency', 'proficiency'],
  },
  CONTACT: { primary: [], synonyms: [], tokenHints: [] }, // extracted separately
  UNKNOWN:  { primary: [], synonyms: [], tokenHints: [] },
};

const SCORED_SECTION_TYPES = Object.keys(SECTION_CONFIGS).filter(
  (t) => t !== 'CONTACT' && t !== 'UNKNOWN',
) as SectionType[];

// Lines with combined score >= this are classified as section headers
const HEADER_THRESHOLD = 0.52;

// ─── Scoring functions ────────────────────────────────────────────────────────

function keywordScore(normalised: string, config: SectionConfig): number {
  // Exact primary match
  if (config.primary.includes(normalised)) return 1.0;

  // Exact synonym match
  if (config.synonyms.includes(normalised)) return 0.85;

  // Primary contains-match
  for (const p of config.primary) {
    if (normalised.includes(p) || p.includes(normalised)) return 0.75;
  }

  // Synonym contains-match
  for (const s of config.synonyms) {
    if (normalised.includes(s) || s.includes(normalised)) return 0.65;
  }

  return 0;
}

function structureScore(
  rawLine: string,
  lineIndex: number,
  lines: string[],
): number {
  let score = 0;

  const t = rawLine.trim();

  // Short line — headers are rarely long
  if (t.length <= 25) score += 0.30;
  else if (t.length <= 45) score += 0.15;

  // ALL CAPS is a very strong header signal
  if (t === t.toUpperCase() && /[A-Z]/.test(t)) score += 0.25;
  // Title Case
  else if (/^[A-Z]/.test(t) && !/[a-z]{20,}/.test(t)) score += 0.12;

  // Ends with colon
  if (t.endsWith(':')) score += 0.10;

  // No mid-line punctuation (headers rarely have periods/commas mid-word)
  if (!/[.,;!?]/.test(t.replace(/,\s*$/, ''))) score += 0.08;

  // Next line is blank (classic header pattern)
  const nextLine = lines[lineIndex + 1];
  if (nextLine !== undefined && !nextLine.trim()) score += 0.12;

  // Previous line is blank (section gap pattern)
  const prevLine = lines[lineIndex - 1];
  if (lineIndex > 0 && prevLine !== undefined && !prevLine.trim()) score += 0.08;

  return Math.min(1, score);
}

function tokenSimilarityScore(normalised: string, config: SectionConfig): number {
  if (!config.tokenHints.length) return 0;

  const lineTokens = tokenise(normalised);
  if (!lineTokens.length) return 0;

  // Jaccard against hint set
  const jaccard = jaccardSimilarity(lineTokens, config.tokenHints);

  // Fuzzy per-token: check if any line token is within edit distance 2
  // of a primary/synonym token for abbreviated headers like "Work Exp"
  let fuzzy = 0;
  const allKeywordTokens = tokenise(
    [...config.primary, ...config.synonyms].join(' '),
  );

  for (const lt of lineTokens) {
    for (const kt of allKeywordTokens) {
      if (kt.length < 4) continue; // skip short keywords
      const dist = levenshtein(lt, kt);
      // Edit distance relative to keyword length
      if (dist <= 2 && dist / kt.length < 0.35) {
        fuzzy = Math.max(fuzzy, 1 - dist / kt.length);
      }
    }
  }

  return Math.min(1, jaccard * 0.6 + fuzzy * 0.4);
}

// ─── Main Detector ────────────────────────────────────────────────────────────

// Score a single line against all section types.
// Returns the best-scoring candidate if it meets the threshold.
function classifyLine(
  line: string,
  lineIndex: number,
  lines: string[],
): SectionCandidate | null {
  const t = line.trim();
  // Fast reject: blank lines, very long lines (paragraphs), and lines with
  // sentence-ending punctuation (not headers).
  if (!t || t.length > 80 || /[.!?]$/.test(t)) return null;
  // Lines longer than 80 chars are almost certainly not section headers;
  // apply a stricter minimum threshold for them.
  if (t.length > 60 && !looksLikeHeader(t)) return null;

  const normalised = normaliseHeaderLine(line);
  if (!normalised || normalised.length < 3) return null;

  let best: SectionCandidate | null = null;

  for (const sectionType of SCORED_SECTION_TYPES) {
    const config = SECTION_CONFIGS[sectionType];

    const kw = keywordScore(normalised, config);
    const st = structureScore(line, lineIndex, lines);
    const tok = tokenSimilarityScore(normalised, config);

    const score = kw * 0.45 + st * 0.35 + tok * 0.20;

    if (score >= HEADER_THRESHOLD && (!best || score > best.score)) {
      best = { lineIndex, line, sectionType, score };
    }
  }

  return best;
}

// ─── Public API ───────────────────────────────────────────────────────────────

// Splits the full resume text into named sections.
// Returns a map of SectionType → raw body text.
export function extractSections(rawText: string): SectionMap {
  const lines = rawText.split('\n');
  const boundaries: Array<{ lineIndex: number; sectionType: SectionType }> = [];

  for (let i = 0; i < lines.length; i++) {
    const candidate = classifyLine(lines[i], i, lines);
    if (candidate) {
      // Merge consecutive detections of the same type (avoids re-triggering
      // on "EDUCATION (continued)" style sub-headers)
      const last = boundaries[boundaries.length - 1];
      if (last && last.sectionType === candidate.sectionType && i - last.lineIndex < 4) {
        continue;
      }
      boundaries.push({ lineIndex: i, sectionType: candidate.sectionType });
    }
  }

  const sectionMap: SectionMap = {};

  // Everything before the first detected header is the implicit CONTACT/header area
  const firstBoundary = boundaries[0]?.lineIndex ?? lines.length;
  sectionMap['CONTACT'] = lines.slice(0, Math.min(firstBoundary, 20)).join('\n');

  for (let b = 0; b < boundaries.length; b++) {
    const { lineIndex, sectionType } = boundaries[b];
    const nextLineIndex = boundaries[b + 1]?.lineIndex ?? lines.length;

    // Skip the header line itself (lineIndex + 1)
    const body = lines.slice(lineIndex + 1, nextLineIndex).join('\n').trim();

    // If the same section appears twice (e.g., two EXPERIENCE blocks in some
    // international resume formats), append rather than overwrite.
    if (sectionMap[sectionType]) {
      sectionMap[sectionType] += '\n\n' + body;
    } else {
      sectionMap[sectionType] = body;
    }
  }

  return sectionMap;
}
