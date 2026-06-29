// Regex-based resume parser (Phase 2).
//
// Design rationale:
//   - Section detection + heuristic field extraction is fast (< 5 ms), free,
//     and offline — appropriate for 100k+ resumes without LLM cost.
//   - The output type (ParsedResumeData) is defined in types.ts, so Phase 3
//     can swap in an LLM-backed implementation without touching the rest of
//     the codebase. Just return the same interface from a different function.
//   - confidenceScore < 0.5 is the trigger for Phase 3 LLM re-parsing.
//   - rawOutput.sections stores the raw section text so the LLM can be
//     given exactly the relevant section as context rather than the full resume.

import type { ParsedResumeData, Education, Experience, Project } from './types';

const PARSER_VERSION = '2.0.0';

// ─── Section Patterns ─────────────────────────────────────────────────────────

// Maps a canonical section key to the regex that detects its header line.
// Keeps the list open for extension (certifications, awards, etc.) without
// touching the parsing logic.
const SECTION_PATTERNS: Record<string, RegExp> = {
  EXPERIENCE:
    /^(work\s*experience|professional\s*experience|employment(\s*history)?|experience|work\s*history|career\s*history)/i,
  EDUCATION:
    /^(education|academic\s*(background|qualifications|history)?|educational\s*background|schooling)/i,
  SKILLS:
    /^(skills?|technical\s*skills?|core\s*(competencies|skills?)|competencies|technologies(\s*used)?|technical\s*proficiencies|areas?\s*of\s*(expertise|proficiency))/i,
  PROJECTS:
    /^(projects?|personal\s*projects?|academic\s*projects?|side\s*projects?|notable\s*projects?|portfolio)/i,
  SUMMARY:
    /^(summary|objective|professional\s*summary|career\s*objective|about(\s*me)?|profile|overview)/i,
  CERTIFICATIONS:
    /^(certifications?|licenses?(\s*&\s*certifications?)?|credentials?|professional\s*development)/i,
};

// ─── Regex Constants ──────────────────────────────────────────────────────────

const EMAIL_RE = /[\w.+\-]+@[\w\-]+\.[\w.]{2,}/;
const PHONE_RE = /(\+?1[\s.\-]?)?(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})/;
const URL_RE = /https?:\/\/[\w\-./]+/g;
const BULLET_RE = /^[•\-*◦▪●·►➢→]/;

const MONTH_NAMES =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;
const YEAR_RE = /\b(19|20)\d{2}\b/;
const CURRENT_RE = /\b(present|current|now|ongoing)\b/i;

// Matches "Jan 2021 – Mar 2023" | "2019 – Present" | "2019 - 2021"
const DATE_RANGE_RE = new RegExp(
  `(?:${MONTH_NAMES.source}[\\s,]*)?${YEAR_RE.source}` +
    `[\\s]*[-–—]+[\\s]*` +
    `(?:(?:${MONTH_NAMES.source}[\\s,]*)?${YEAR_RE.source}|${CURRENT_RE.source})`,
  'gi',
);

const DEGREE_RE =
  /\b(b\.?s\.?c?\.?|b\.?a\.?|m\.?s\.?|m\.?b\.?a\.?|ph\.?d\.?|bachelor(?:'?s)?|master(?:'?s)?|associate(?:'?s)?|doctor(?:ate)?)\b/i;

const INSTITUTION_RE =
  /\b(university|college|institute|school|academy|polytechnic|iit|nit)\b/i;

const GPA_RE = /\bgpa[:\s]+(\d\.\d{1,2})/i;

const TECH_LABEL_RE =
  /^(technologies?|tech(\s*stack)?|tools?|built\s*with|stack|frameworks?)[:\s]/i;

// ─── Entry Point ──────────────────────────────────────────────────────────────

export function parseResumeText(rawText: string): ParsedResumeData {
  const lines = rawText.split('\n').map((l) => l.trim());

  const sections = splitIntoSections(lines);
  const { candidateName, email, phone } = extractContactInfo(lines);

  const skills = parseSkills(sections['SKILLS'] ?? '');
  const education = parseEducation(sections['EDUCATION'] ?? '');
  const experience = parseExperience(sections['EXPERIENCE'] ?? '');
  const projects = parseProjects(sections['PROJECTS'] ?? '');

  const confidenceScore = computeConfidence({
    candidateName,
    email,
    skills,
    education,
    experience,
  });

  return {
    candidateName,
    email,
    phone,
    skills,
    education,
    experience,
    projects,
    confidenceScore,
    rawOutput: { sections, parserVersion: PARSER_VERSION, parsedAt: new Date().toISOString() },
  };
}

// ─── Section Splitting ────────────────────────────────────────────────────────

// Returns a map of section key → raw section body text.
// Lines before the first recognised header go into a synthetic '__HEADER__'
// key used by contact extraction.
function splitIntoSections(lines: string[]): Record<string, string> {
  const sections: Record<string, string> = {};
  let current = '__HEADER__';
  sections[current] = '';

  for (const line of lines) {
    const key = detectSectionHeader(line);
    if (key) {
      current = key;
      sections[key] ??= '';
    } else {
      sections[current] += line + '\n';
    }
  }

  return sections;
}

function detectSectionHeader(line: string): string | null {
  // Strip leading/trailing decorator characters common in resume formatting
  const cleaned = line
    .replace(/^[\s\-_=*#•►▪\t]+/, '')
    .replace(/[\s\-_=*#•►▪:\t]+$/, '')
    .trim();

  if (!cleaned || cleaned.length > 70) return null;

  for (const [key, pattern] of Object.entries(SECTION_PATTERNS)) {
    if (pattern.test(cleaned)) return key;
  }
  return null;
}

// ─── Contact Extraction ───────────────────────────────────────────────────────

function extractContactInfo(lines: string[]): {
  candidateName: string | null;
  email: string | null;
  phone: string | null;
} {
  // Search only the header area (first 15 lines) for contact details
  const headerText = lines.slice(0, 15).join('\n');

  const emailMatch = EMAIL_RE.exec(headerText);
  const phoneMatch = PHONE_RE.exec(headerText);

  // Name heuristic: first line that looks like a proper name.
  // Criteria: 2–5 words, each starting with a capital letter, no digits,
  // not an email or phone, not a known keyword.
  let candidateName: string | null = null;

  for (const line of lines.slice(0, 8)) {
    if (!line || EMAIL_RE.test(line) || PHONE_RE.test(line)) continue;
    if (/\d/.test(line) || URL_RE.test(line)) continue;
    if (line.length > 60) continue;

    const words = line.split(/\s+/).filter(Boolean);
    const capitalised = words.filter((w) => /^[A-Z]/.test(w));

    if (words.length >= 2 && words.length <= 5 && capitalised.length >= 2) {
      candidateName = words.join(' ');
      break;
    }
  }

  return {
    candidateName,
    email: emailMatch ? emailMatch[0] : null,
    phone: phoneMatch ? phoneMatch[0] : null,
  };
}

// ─── Skills Parser ────────────────────────────────────────────────────────────

function parseSkills(sectionText: string): string[] {
  if (!sectionText.trim()) return [];

  const skills = new Set<string>();

  // Split by commas, bullets, pipes, and newlines — all common skill delimiters
  const tokens = sectionText
    .split(/[,•|●▪◦\n\t]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && t.length < 60);

  for (const token of tokens) {
    // Skip sub-category labels like "Frontend:", "Languages:"
    if (TECH_LABEL_RE.test(token)) {
      const rest = token.replace(TECH_LABEL_RE, '').trim();
      if (rest) {
        rest.split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => skills.add(s));
      }
      continue;
    }

    // Skip short all-cap tokens that are likely sub-headers, not skill names
    if (token === token.toUpperCase() && token.length < 20 && /[A-Z]{3,}/.test(token)) {
      continue;
    }

    skills.add(token);
  }

  return Array.from(skills);
}

// ─── Education Parser ─────────────────────────────────────────────────────────

function parseEducation(sectionText: string): Education[] {
  if (!sectionText.trim()) return [];

  return splitEntries(sectionText)
    .map(parseEducationEntry)
    .filter((e): e is Education => !!e.institution);
}

function parseEducationEntry(block: string): Partial<Education> {
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
  const entry: Partial<Education> = {};

  for (const line of lines) {
    if (!entry.institution && INSTITUTION_RE.test(line)) {
      entry.institution = line;
      continue;
    }

    if (!entry.degree && DEGREE_RE.test(line)) {
      entry.degree = line;
      continue;
    }

    const dateMatches = [...line.matchAll(DATE_RANGE_RE)];
    if (dateMatches.length > 0) {
      const [start, end] = parseDateRange(dateMatches[0][0]);
      entry.startDate = start;
      entry.endDate = end;
      continue;
    }

    const gpaMatch = GPA_RE.exec(line);
    if (gpaMatch) {
      entry.gpa = gpaMatch[1];
    }
  }

  // Fallback: if no institution keyword found, assume first line is institution
  if (!entry.institution && lines.length > 0) {
    entry.institution = lines[0];
  }

  return entry;
}

// ─── Experience Parser ────────────────────────────────────────────────────────

function parseExperience(sectionText: string): Experience[] {
  if (!sectionText.trim()) return [];

  return splitEntries(sectionText)
    .map(parseExperienceEntry)
    .filter((e): e is Experience => !!(e.company || e.title));
}

function parseExperienceEntry(block: string): Partial<Experience> {
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
  const entry: Partial<Experience> = { bullets: [] };

  for (const line of lines) {
    // Bullet point → add to accomplishments
    if (BULLET_RE.test(line)) {
      (entry.bullets ??= []).push(line.replace(BULLET_RE, '').trim());
      continue;
    }

    // Date range — extract and strip from line to find company/title remainder
    const dateMatches = [...line.matchAll(DATE_RANGE_RE)];
    if (dateMatches.length > 0) {
      const [start, end] = parseDateRange(dateMatches[0][0]);
      entry.startDate = start;
      entry.endDate = end;
      entry.current = CURRENT_RE.test(dateMatches[0][0]);

      // Whatever remains after removing the date might be the company/title
      const remainder = line
        .replace(dateMatches[0][0], '')
        .replace(/[|\-–—,]/g, ' ')
        .trim();
      if (remainder && !entry.company) entry.company = remainder;
      continue;
    }

    // Pipe-separated format: "Senior Engineer | Acme Corp | Remote"
    if (line.includes('|') || line.includes('–')) {
      const parts = line.split(/[|–]/).map((p) => p.trim()).filter(Boolean);
      if (!entry.title) entry.title = parts[0];
      if (!entry.company && parts[1]) entry.company = parts[1];
      continue;
    }

    // First meaningful, non-bullet line: job title
    // Second: company name
    if (!entry.title) { entry.title = line; continue; }
    if (!entry.company) { entry.company = line; }
  }

  return entry;
}

// ─── Projects Parser ──────────────────────────────────────────────────────────

function parseProjects(sectionText: string): Project[] {
  if (!sectionText.trim()) return [];

  return splitEntries(sectionText)
    .map(parseProjectEntry)
    .filter((p): p is Project => !!p.name);
}

function parseProjectEntry(block: string): Partial<Project> {
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
  const project: Partial<Project> = { technologies: [], description: '' };
  const descParts: string[] = [];

  for (const line of lines) {
    if (!project.name) { project.name = line; continue; }

    if (TECH_LABEL_RE.test(line)) {
      const techStr = line.replace(TECH_LABEL_RE, '');
      project.technologies = techStr.split(/[,|]/).map((t) => t.trim()).filter(Boolean);
      continue;
    }

    const urlMatch = URL_RE.exec(line);
    if (urlMatch && !project.url) {
      project.url = urlMatch[0];
      continue;
    }

    if (BULLET_RE.test(line)) {
      descParts.push(line.replace(BULLET_RE, '').trim());
    }
  }

  project.description = descParts.join(' ') || undefined;
  return project;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Splits a section's raw text into individual entries separated by blank lines.
// This is the main heuristic for distinguishing between multiple jobs/degrees.
function splitEntries(sectionText: string): string[] {
  const blocks: string[] = [];
  let current = '';

  for (const line of sectionText.split('\n')) {
    if (!line.trim() && current.trim()) {
      blocks.push(current);
      current = '';
    } else {
      current += line + '\n';
    }
  }

  if (current.trim()) blocks.push(current);
  return blocks;
}

function parseDateRange(dateStr: string): [string | undefined, string | undefined] {
  const parts = dateStr.split(/[-–—]+/).map((p) => p.trim());
  return [parts[0] || undefined, parts[1] || undefined];
}

// Simple rubric: 4 equally-weighted signals.
// Scores below 0.5 will trigger LLM re-parse in Phase 3.
function computeConfidence(data: {
  candidateName: string | null;
  email: string | null;
  skills: string[];
  education: Education[];
  experience: Experience[];
}): number {
  let score = 0;
  if (data.candidateName) score += 0.25;
  if (data.email) score += 0.25;
  if (data.skills.length >= 3) score += 0.25;
  if (data.education.length >= 1 || data.experience.length >= 1) score += 0.25;
  return score;
}
