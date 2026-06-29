// ─── Date Normalizer ──────────────────────────────────────────────────────────
//
// Converts raw date strings from resume text into structured year strings.
// Only extracts years (not months) because month-precision is rarely used
// downstream and makes the output noisier.

import { DATE_RANGE_RE, CURRENT_MARKER_RE, STANDALONE_YEAR_RE } from '../utils/regex.constants';
import { extractYears } from '../utils/text.utils';

const CURRENT_YEAR = new Date().getFullYear().toString();

export interface DateRange {
  startYear: string | null;
  endYear: string | null;
  raw: string | null; // original text — stored as `duration` in ExperienceEntry
}

// Attempt to parse a date range from a text fragment.
// Returns null values for any part that cannot be determined.
export function parseDateRange(text: string): DateRange {
  if (!text?.trim()) return { startYear: null, endYear: null, raw: null };

  // Try full date range pattern first
  const rangeMatch = DATE_RANGE_RE.exec(text);
  if (rangeMatch) {
    const raw = rangeMatch[0].trim();
    const years = extractYears(raw);
    const isCurrent = CURRENT_MARKER_RE.test(raw);

    return {
      startYear: years[0]?.toString() ?? null,
      endYear: isCurrent ? CURRENT_YEAR : (years[1]?.toString() ?? null),
      raw,
    };
  }

  // Fall back to extracting all standalone years
  const allYears = text.match(STANDALONE_YEAR_RE);
  if (allYears && allYears.length >= 2) {
    return {
      startYear: allYears[0],
      endYear: CURRENT_MARKER_RE.test(text) ? CURRENT_YEAR : allYears[allYears.length - 1],
      raw: text.trim(),
    };
  }

  if (allYears && allYears.length === 1) {
    return {
      startYear: allYears[0],
      endYear: CURRENT_MARKER_RE.test(text) ? CURRENT_YEAR : null,
      raw: text.trim(),
    };
  }

  return { startYear: null, endYear: null, raw: null };
}

// Extract the first date range found in an arbitrary block of text.
export function findFirstDateRange(text: string): DateRange {
  // Reset lastIndex before every use since the regex is global
  DATE_RANGE_RE.lastIndex = 0;
  const match = DATE_RANGE_RE.exec(text);
  if (match) return parseDateRange(match[0]);

  const years = text.match(STANDALONE_YEAR_RE);
  if (years) return parseDateRange(years.join(' – '));

  return { startYear: null, endYear: null, raw: null };
}
