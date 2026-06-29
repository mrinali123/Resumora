// ─── Shared Regex Constants ───────────────────────────────────────────────────
// Single source of truth for all patterns used across extractors.
// Kept here so changes propagate everywhere without hunting down duplicates.

// Contact
export const EMAIL_RE =
  /\b[\w.+\-]{1,64}@(?:[\w\-]+\.)+[a-z]{2,}\b/i;

// Matches US (+1 or bare), Indian (+91), UK (+44), and most other formats.
// Pattern: optional country code (+1 to +3 digits), then 7–12 local digits
// with typical separators (space, dot, dash, parens).
export const PHONE_RE =
  /(?:\+\d{1,3}[\s.\-]?)?(?:\(?\d{2,5}\)?[\s.\-]?)(?:\d{2,5}[\s.\-]?){1,3}\d{2,5}/;

export const LINKEDIN_RE =
  /(?:linkedin\.com\/in\/|linkedin:\s*)[\w\-]+/i;

export const GITHUB_RE =
  /(?:github\.com\/|github:\s*)[\w\-]+/i;

export const URL_RE = /https?:\/\/[\w\-./?\#=&%+]+/g;

// Dates
export const YEAR_RE = /\b(19|20)\d{2}\b/;

export const MONTH_NAME_RE =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;

export const CURRENT_MARKER_RE = /\b(present|current|now|ongoing|till\s*date|to\s*date)\b/i;

// Matches: "Jan 2021 – Mar 2023" | "2019 – Present" | "2019 - 2021"
// | "March 2020 to Present"
export const DATE_RANGE_RE = new RegExp(
  `(?:${MONTH_NAME_RE.source}[\\s,]*)?${YEAR_RE.source}` +
    `[\\s]*(?:[-–—]|to)[\\s]*` +
    `(?:(?:${MONTH_NAME_RE.source}[\\s,]*)?${YEAR_RE.source}|${CURRENT_MARKER_RE.source})`,
  'gi',
);

// Single year
export const STANDALONE_YEAR_RE = /\b(19|20)\d{2}\b/g;

// Education
export const DEGREE_RE =
  /\b(b\.?s\.?c?\.?|b\.?[ae]\.?|m\.?s\.?|m\.?[ae]\.?|m\.?b\.?a\.?|ph\.?d\.?|d\.?sc\.?|bachelor(?:'?s)?(?:\s+of\s+\w+)?|master(?:'?s)?(?:\s+of\s+\w+)?|associate(?:'?s)?|doctor(?:ate)?(?:\s+of\s+\w+)?|b\.?tech|m\.?tech|b\.?e\.?|m\.?e\.?)\b/i;

export const INSTITUTION_RE =
  /\b(university|college|institute(?:\s+of\s+technology)?|school|academy|polytechnic|iit|nit|mit|stanford|harvard|oxford|cambridge|caltech)\b/i;

export const GPA_RE = /\b(?:gpa|cgpa|grade)[:\s]+(\d\.\d{1,2})\b/i;

// Experience
export const BULLET_RE = /^[•\-*◦▪●·►➢→✓✦‣⊳]\s*/;

// Skills
export const TECH_LABEL_RE =
  /^(?:technologies?|tech(?:nical)?(?:\s*stack)?|tools?|built\s*with|stack|frameworks?|languages?|platforms?|databases?|libraries|software)[:\s–-]+/i;

// Project
export const PROJECT_LINK_RE = /(?:https?:\/\/|github\.com\/|gitlab\.com\/)[\w\-./]+/i;

// Structural / formatting
// Line is likely a section header if short and not a sentence.
export const LIKELY_HEADER_RE = /^[A-Z][\w\s&/\-,()]{0,60}[^.!?,]?$/;

// Line looks like a name (2-5 proper-case words, no numbers)
export const LIKELY_NAME_RE =
  /^(?:[A-Z][a-z'-]+(?:\s+[A-Z][a-z'-]+){1,4})$/;
