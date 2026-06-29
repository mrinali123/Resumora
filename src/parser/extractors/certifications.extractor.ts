// ─── Certifications Extractor ─────────────────────────────────────────────────

import { BULLET_RE, YEAR_RE } from '../utils/regex.constants';
import { stripBullet } from '../utils/text.utils';

export function extractCertifications(sectionText: string): string[] {
  if (!sectionText?.trim()) return [];

  const certs: string[] = [];

  for (const line of sectionText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let cert = BULLET_RE.test(trimmed) ? stripBullet(trimmed) : trimmed;

    // Strip trailing year/date "(2023)" or "— 2023"
    cert = cert
      .replace(/[\s,–\-]+\d{4}\s*$/, '')
      .replace(/\s*\(\d{4}\)\s*$/, '')
      .trim();

    if (cert.length > 3 && cert.length < 200) {
      certs.push(cert);
    }
  }

  // Deduplicate (case-insensitive)
  const seen = new Map<string, string>();
  for (const c of certs) {
    const key = c.toLowerCase();
    if (!seen.has(key)) seen.set(key, c);
  }

  return Array.from(seen.values());
}
