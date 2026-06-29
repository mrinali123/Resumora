// ─── Skills Extractor ─────────────────────────────────────────────────────────
//
// Two-pass extraction:
//   Pass 1 — Parse the SKILLS section using delimiter splitting
//   Pass 2 — Cross-body scan of EXPERIENCE + PROJECTS for tech terms
//             that appear in the TECH_SKILLS dictionary (avoids false positives)
//
// Results from both passes are merged before normalisation.

import { TECH_LABEL_RE } from '../utils/regex.constants';
import { splitByBlankLines, stripBullet } from '../utils/text.utils';
import { normaliseAndDedup } from '../normalizers/skill.normalizer';
import { TECH_SKILLS } from '../../analysis/skills.constants';

// Pre-built set of lowercased canonical skill names for O(1) cross-body lookup
const CANONICAL_SKILLS_LOWER: Set<string> = new Set(
  (TECH_SKILLS as readonly string[]).map((s) => s.toLowerCase()),
);

// ─── Pass 1: Skills section parsing ──────────────────────────────────────────

export function extractSkillsFromSection(sectionText: string): string[] {
  if (!sectionText?.trim()) return [];

  const raw: string[] = [];

  for (const line of sectionText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Strip sub-category label ("Frontend: React, Vue, ...")
    const withoutLabel = trimmed.replace(TECH_LABEL_RE, '');

    // Delimiters: comma, bullet, pipe, semicolon
    const tokens = withoutLabel
      .split(/[,•|●▪◦;\/\t]/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && t.length <= 60);

    raw.push(...tokens);
  }

  return raw;
}

// ─── Pass 2: Cross-body scan ──────────────────────────────────────────────────
// Scans free-form text blocks for exact matches against the TECH_SKILLS dict.
// Only exact matches (case-insensitive) are accepted to avoid hallucinating
// skills from generic prose ("experience with multiple technologies").

export function extractSkillsFromBody(bodyText: string): string[] {
  if (!bodyText?.trim()) return [];

  const found: string[] = [];

  // Build a regex that matches any of the canonical skill names as whole words.
  // Cached at module level to avoid rebuilding on every call.
  for (const skill of TECH_SKILLS) {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'i');
    if (re.test(bodyText)) {
      found.push(skill);
    }
  }

  return found;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function extractSkills(
  skillsSectionText: string,
  supplementaryText: string, // concatenated EXPERIENCE + PROJECTS sections
): string[] {
  const fromSection = extractSkillsFromSection(skillsSectionText);
  const fromBody = extractSkillsFromBody(supplementaryText);

  // Merge, normalise, and deduplicate
  return normaliseAndDedup([...fromSection, ...fromBody]);
}
