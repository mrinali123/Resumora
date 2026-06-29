// ─── Contact Extractor ────────────────────────────────────────────────────────

import {
  EMAIL_RE,
  PHONE_RE,
  LINKEDIN_RE,
  GITHUB_RE,
  LIKELY_NAME_RE,
} from '../utils/regex.constants';

export interface ContactInfo {
  name: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  github: string | null;
}

// The CONTACT section is the implicit header area (first ~20 lines of the
// document before the first recognised section header).
export function extractContact(contactSection: string): ContactInfo {
  const lines = contactSection
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const fullText = lines.join('\n');

  const email = (EMAIL_RE.exec(fullText) ?? [])[0] ?? null;
  const phone = (PHONE_RE.exec(fullText) ?? [])[0] ?? null;
  const linkedin = extractLinkedIn(fullText);
  const github = extractGitHub(fullText);
  const name = extractName(lines, email, phone);

  return { name, email, phone, linkedin, github };
}

// ─── Name extraction ──────────────────────────────────────────────────────────
// Candidates: any line in the first 8 that:
//   - matches the proper-name pattern (2-5 properly capitalised words)
//   - contains no digits, URLs, email or phone patterns
//   - is not a known section keyword
// The first qualifying line wins.

const SECTION_KEYWORDS = new Set([
  'summary', 'objective', 'education', 'experience', 'skills',
  'projects', 'certifications', 'profile', 'resume', 'cv',
  'curriculum vitae', 'contact', 'address', 'references',
]);

function extractName(
  lines: string[],
  email: string | null,
  phone: string | null,
): string | null {
  for (const line of lines.slice(0, 8)) {
    // Skip lines that contain the email or phone we already found
    if (email && line.includes(email)) continue;
    if (phone && line.includes(phone)) continue;

    // Skip lines with digits (dates, phone numbers)
    if (/\d/.test(line)) continue;

    // Skip section keywords
    if (SECTION_KEYWORDS.has(line.toLowerCase())) continue;

    // Skip very long lines (headers are short)
    if (line.length > 60) continue;

    if (LIKELY_NAME_RE.test(line)) return line;

    // Relaxed heuristic for names with middle initials or hyphenated last names
    const words = line.split(/\s+/);
    if (
      words.length >= 2 &&
      words.length <= 5 &&
      words.every((w) => /^[A-Z]/.test(w)) &&
      words.join('').replace(/[A-Za-z\-.']/g, '').length === 0
    ) {
      return line;
    }
  }

  return null;
}

function extractLinkedIn(text: string): string | null {
  const match = LINKEDIN_RE.exec(text);
  return match ? match[0] : null;
}

function extractGitHub(text: string): string | null {
  const match = GITHUB_RE.exec(text);
  return match ? match[0] : null;
}
