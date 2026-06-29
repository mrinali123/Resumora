// ─── Education Extractor ──────────────────────────────────────────────────────

import type { EducationEntry } from '../types';
import {
  DEGREE_RE,
  INSTITUTION_RE,
  GPA_RE,
  BULLET_RE,
} from '../utils/regex.constants';
import { splitByBlankLines, stripBullet } from '../utils/text.utils';
import { findFirstDateRange } from '../normalizers/date.normalizer';

export function extractEducation(sectionText: string): EducationEntry[] {
  if (!sectionText?.trim()) return [];

  const blocks = splitByBlankLines(sectionText);
  return blocks
    .map(parseEducationBlock)
    .filter((e): e is EducationEntry => !!e.institution);
}

function parseEducationBlock(block: string): Partial<EducationEntry> {
  const lines = block
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const entry: Partial<EducationEntry> = {
    institution: undefined,
    degree: null,
    startYear: null,
    endYear: null,
  };

  for (const line of lines) {
    // Skip bullet lines — education sections sometimes contain coursework lists
    if (BULLET_RE.test(line)) continue;

    // Date range — extract years and remove from further processing
    const dateRange = findFirstDateRange(line);
    if (dateRange.startYear || dateRange.endYear) {
      entry.startYear ??= dateRange.startYear;
      entry.endYear ??= dateRange.endYear;
    }

    // Degree detection
    if (!entry.degree && DEGREE_RE.test(line)) {
      // Extract just the degree token (not the full line which may include institution)
      entry.degree = extractDegree(line);
    }

    // Institution detection
    if (!entry.institution && INSTITUTION_RE.test(line)) {
      entry.institution = cleanInstitutionLine(line);
      continue;
    }

    // GPA — stored as part of degree for now, could be its own field
    const gpaMatch = GPA_RE.exec(line);
    if (gpaMatch && !entry.degree) {
      entry.degree = entry.degree ?? null;
    }
  }

  // Fallback: if no institution keyword found but block has content,
  // assume the first non-date, non-degree line is the institution name.
  if (!entry.institution && lines.length > 0) {
    const candidate = lines.find(
      (l) => !findFirstDateRange(l).startYear && !BULLET_RE.test(l),
    );
    if (candidate) entry.institution = candidate;
  }

  return entry;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractDegree(line: string): string {
  const match = DEGREE_RE.exec(line);
  if (!match) return line;

  // Try to capture "Bachelor of Science in Computer Science" style
  const fromDegree = line.slice(match.index).trim();

  // Stop at common delimiters that indicate the institution follows
  const stopAt = fromDegree.search(/[,|–\-]|\b(?:at|from|in)\b\s+[A-Z]/);
  if (stopAt > 0) return fromDegree.slice(0, stopAt).trim();

  return fromDegree.length > 60 ? match[0] : fromDegree;
}

function cleanInstitutionLine(line: string): string {
  // Strip trailing location, date tokens, GPA
  return line
    .replace(/,\s*\d{4}.*$/, '')          // trailing year
    .replace(/\s*[-–|]\s*\d{4}.*$/, '')  // " - 2021"
    .replace(/,\s*[A-Z]{2}\b.*$/, '')     // ", CA, USA"
    .replace(GPA_RE, '')
    .trim();
}
