// ─── Experience Extractor ─────────────────────────────────────────────────────

import type { ExperienceEntry } from '../types';
import { BULLET_RE, DATE_RANGE_RE, CURRENT_MARKER_RE } from '../utils/regex.constants';
import { splitByBlankLines, stripBullet } from '../utils/text.utils';
import { findFirstDateRange } from '../normalizers/date.normalizer';

export function extractExperience(sectionText: string): ExperienceEntry[] {
  if (!sectionText?.trim()) return [];

  const blocks = splitByBlankLines(sectionText);
  return blocks
    .map(parseExperienceBlock)
    .filter((e): e is ExperienceEntry => !!(e.company || e.role));
}

function parseExperienceBlock(block: string): Partial<ExperienceEntry> {
  const lines = block
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const entry: Partial<ExperienceEntry> = {
    company: undefined,
    role: null,
    duration: null,
    bulletPoints: [],
  };

  let headerLinesConsumed = 0;

  for (const line of lines) {
    // Bullet points are unambiguously body content
    if (BULLET_RE.test(line)) {
      (entry.bulletPoints ??= []).push(stripBullet(line));
      continue;
    }

    // Lines that start with strong bullet-like indentation but use dash or *
    if (/^[\s]{2,}[-*]/.test(line)) {
      (entry.bulletPoints ??= []).push(stripBullet(line));
      continue;
    }

    // Date range extraction
    DATE_RANGE_RE.lastIndex = 0;
    const dateMatch = DATE_RANGE_RE.exec(line);
    if (dateMatch) {
      if (!entry.duration) {
        entry.duration = dateMatch[0].trim();
        const dr = findFirstDateRange(dateMatch[0]);
        // Keep duration as raw string (the field contract), years go into meta
        entry.duration = dateMatch[0].trim();
      }

      // The remainder of a date-containing line often has company/role
      const remainder = line
        .replace(dateMatch[0], '')
        .replace(/^[\s|,\-–—]+/, '')
        .trim();

      if (remainder && headerLinesConsumed < 2) {
        assignHeaderToken(entry, remainder);
        headerLinesConsumed++;
      }
      continue;
    }

    // Pipe/dash separated header: "Software Engineer | Google | Mountain View"
    if ((line.includes(' | ') || line.includes(' – ') || line.includes(' — ')) &&
        headerLinesConsumed < 2) {
      const parts = line.split(/\s[|–—]\s/).map((p) => p.trim());
      if (!entry.role && parts[0]) entry.role = parts[0];
      if (!entry.company && parts[1]) entry.company = parts[1];
      headerLinesConsumed++;
      continue;
    }

    // Comma-separated "Role, Company" or "Company, Role"
    if (line.includes(',') && headerLinesConsumed < 2 && !entry.company) {
      const parts = line.split(',').map((p) => p.trim());
      // Heuristic: the second token is likely a company if it starts with a capital
      // and is shorter than the first (job titles are longer than company names)
      if (parts.length === 2 && /^[A-Z]/.test(parts[1])) {
        if (!entry.role) entry.role = parts[0];
        if (!entry.company) entry.company = parts[1];
        headerLinesConsumed++;
        continue;
      }
    }

    // Plain header lines — first = role/title, second = company
    if (headerLinesConsumed < 3) {
      assignHeaderToken(entry, line);
      headerLinesConsumed++;
    } else {
      // Long sentences after header area are achievement bullets without markers
      if (line.length > 30) {
        (entry.bulletPoints ??= []).push(line);
      }
    }
  }

  return entry;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Fill role then company in order.
function assignHeaderToken(
  entry: Partial<ExperienceEntry>,
  token: string,
): void {
  // Skip if token looks like a location ("Remote", "New York, NY", etc.)
  if (isLocation(token)) return;

  if (!entry.role) { entry.role = token; return; }
  if (!entry.company) { entry.company = token; }
}

const LOCATION_WORDS = new Set([
  'remote', 'hybrid', 'on-site', 'onsite', 'new york', 'san francisco',
  'los angeles', 'chicago', 'seattle', 'austin', 'boston', 'london',
  'bangalore', 'mumbai', 'delhi', 'hyderabad', 'pune', 'chennai',
]);

function isLocation(text: string): boolean {
  const lower = text.toLowerCase();
  if (LOCATION_WORDS.has(lower)) return true;
  // State/country code patterns: "NY, USA" | "CA" | "India"
  if (/^[A-Z]{2}$/.test(text.trim())) return true;
  if (/^[A-Za-z\s]+,\s*[A-Z]{2}$/.test(text.trim())) return true;
  return false;
}
