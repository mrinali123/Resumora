// ─── Text Utilities ───────────────────────────────────────────────────────────

// Normalise raw extracted text for consistent downstream processing.
export function cleanRawText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/ /g, ' ')       // non-breaking space
    .replace(/[​-‍]/g, '') // zero-width chars
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Strip leading bullets, decorators and trailing punctuation from a line.
export function stripBullet(line: string): string {
  return line
    .replace(/^[•\-*◦▪●·►➢→✓✦‣⊳\s]+/, '')
    .replace(/[;\s]+$/, '')
    .trim();
}

// Collapse decorative horizontal rules into blank lines.
export function collapseRules(line: string): string {
  if (/^[\-=_*#]{3,}\s*$/.test(line.trim())) return '';
  return line;
}

// Prepare a line for header-classification: lowercase, strip punctuation
// decorators at both ends, collapse interior whitespace.
export function normaliseHeaderLine(line: string): string {
  return line
    .replace(/^[\s\-_=*#•►▪:\t]+/, '')
    .replace(/[\s\-_=*#•►▪:\t]+$/, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

// Tokenise a string into lowercase words (removes punctuation).
export function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

// Splits a block of section text into logical entries separated by blank lines.
// Blank-line separation is the most reliable heuristic for multi-entry sections
// (e.g., two jobs or two degrees).
export function splitByBlankLines(text: string): string[] {
  const blocks: string[] = [];
  let current = '';

  for (const line of text.split('\n')) {
    if (!line.trim() && current.trim()) {
      blocks.push(current.trim());
      current = '';
    } else {
      current += line + '\n';
    }
  }
  if (current.trim()) blocks.push(current.trim());

  return blocks.filter((b) => b.trim().length > 0);
}

// Levenshtein distance — used for fuzzy header matching.
// O(m*n) — only called on short strings (< 70 chars), so performance is fine.
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// Jaccard similarity on token sets — used for NLP section scoring.
export function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((t) => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

// Returns true if the line appears to be ALL CAPS or Title Case header-style.
export function looksLikeHeader(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 70) return false;
  const isAllCaps = t === t.toUpperCase() && /[A-Z]{2,}/.test(t);
  const isTitleCase = /^[A-Z][a-z]/.test(t) && !/[.!?]$/.test(t);
  return isAllCaps || isTitleCase;
}

// Extract all 4-digit years from a string.
export function extractYears(text: string): number[] {
  const matches = text.match(/\b(19|20)\d{2}\b/g) ?? [];
  return matches.map(Number);
}
