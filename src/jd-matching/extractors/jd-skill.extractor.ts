// ─── JD Skill Extractor ───────────────────────────────────────────────────────
//
// Multi-pass NLP extraction of tech skills from raw job description text.
//
// Pass 1: Section detection — classify each block as required / preferred / general.
//         Uses header keyword heuristics (not a general NLP library) so it works
//         on any plain-text JD without dependencies.
//
// Pass 2: Skill scanning — match every TECH_SKILLS entry against each section
//         using word-boundary regex, accumulate per-section frequencies.
//
// Pass 3: Weight computation:
//           weight = section_weight × (0.55 + 0.45 × freq_boost)
//         where freq_boost = log(1 + freq) / log(6), capped at 1.0
//         This means a skill mentioned once in "Requirements" (weight ≈ 0.55) is
//         worth more than one mentioned 10× in a general "About the Role" paragraph.
//
// Output: SkillWithWeight[], sorted by weight descending.

import { TECH_SKILLS } from '../../analysis/skills.constants';
import type { JdSectionType, SkillWithWeight } from '../types';

// ─── Section weights ──────────────────────────────────────────────────────────

const SECTION_WEIGHTS: Record<JdSectionType, number> = {
  required: 1.0,
  preferred: 0.70,
  general: 0.45,
};

// ─── Header detection regexes ─────────────────────────────────────────────────
// Match common JD section headers. Tested against headers such as:
//   "Requirements", "What You'll Need", "Must Have", "Minimum Qualifications",
//   "Basic Requirements", "What We're Looking For", "Job Requirements"

const REQUIRED_HEADER_RE =
  /\b(requirements?|required|must[\s-]have|mandatory|minimum\s+qualifications?|basic\s+qualifications?|what\s+you['']?ll?\s+need|what\s+we['']?re\s+looking\s+for|job\s+requirements?|essential\s+qualifications?)\b/i;

// "Nice to Have", "Preferred Qualifications", "Bonus Points", "Desired Skills"
const PREFERRED_HEADER_RE =
  /\b(preferred|nice[\s-]to[\s-]have|bonus|plus|additional\s+qualifications?|desired|what\s+makes\s+you|good\s+to\s+have|optional|would\s+be\s+a\s+plus)\b/i;

// ─── JD section parser ────────────────────────────────────────────────────────

interface JdSection {
  type: JdSectionType;
  text: string;
}

function parseJdSections(jdText: string): JdSection[] {
  const lines = jdText.split('\n');
  const sections: JdSection[] = [];
  let currentType: JdSectionType = 'general';
  let currentLines: string[] = [];

  for (const line of lines) {
    const t = line.trim();

    if (!t) {
      currentLines.push(line);
      continue;
    }

    // A line is a candidate header if it's short and not a sentence
    const isShortLine = t.length <= 80;
    const isNotSentence = !/[.?!]$/.test(t);

    if (isShortLine && isNotSentence) {
      if (REQUIRED_HEADER_RE.test(t)) {
        sections.push({ type: currentType, text: currentLines.join('\n') });
        currentType = 'required';
        currentLines = [];
        continue;
      }
      if (PREFERRED_HEADER_RE.test(t)) {
        sections.push({ type: currentType, text: currentLines.join('\n') });
        currentType = 'preferred';
        currentLines = [];
        continue;
      }
    }

    currentLines.push(line);
  }

  sections.push({ type: currentType, text: currentLines.join('\n') });

  return sections.filter((s) => s.text.trim().length > 0);
}

// ─── Skill scanning ───────────────────────────────────────────────────────────

// Priority ordering for "most prominent section" resolution
const SECTION_PRIORITY: Record<JdSectionType, number> = {
  required: 2,
  preferred: 1,
  general: 0,
};

export function extractJdSkills(jdText: string): SkillWithWeight[] {
  const sections = parseJdSections(jdText);

  // Map: canonical skill name → accumulated data
  const skillMap = new Map<
    string,
    { totalFreq: number; bestSection: JdSectionType }
  >();

  for (const skill of TECH_SKILLS) {
    // Escape special regex chars in skill name (e.g. "C++", "C#", "Node.js")
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Skills ending in + or # don't pair naturally with \b (non-word chars)
    const trailingBoundary = /[+#]$/.test(skill) ? '' : '\\b';
    const re = new RegExp(`(?<![a-z])${escaped}${trailingBoundary}`, 'gi');

    let totalFreq = 0;
    let bestSection: JdSectionType = 'general';

    for (const section of sections) {
      const matches = section.text.match(re);
      if (!matches) continue;

      totalFreq += matches.length;

      if (SECTION_PRIORITY[section.type] > SECTION_PRIORITY[bestSection]) {
        bestSection = section.type;
      }
    }

    if (totalFreq === 0) continue;

    const prev = skillMap.get(skill);
    if (
      !prev ||
      totalFreq > prev.totalFreq ||
      SECTION_PRIORITY[bestSection] > SECTION_PRIORITY[prev.bestSection]
    ) {
      skillMap.set(skill, { totalFreq, bestSection });
    }
  }

  // ─── Weight computation ───────────────────────────────────────────────────

  const result: SkillWithWeight[] = [];

  for (const [skill, { totalFreq, bestSection }] of skillMap) {
    // Log-scale frequency boost: freq=1→0, freq=3→0.63, freq=5→0.90, freq≥6→1.0
    const freqBoost = Math.min(1, Math.log(1 + totalFreq) / Math.log(6));
    const sectionWeight = SECTION_WEIGHTS[bestSection];

    // Base 0.55 ensures even a single-occurrence required skill has meaningful weight.
    const weight = sectionWeight * (0.55 + 0.45 * freqBoost);

    result.push({
      skill,
      weight: parseFloat(weight.toFixed(4)),
      frequency: totalFreq,
      section: bestSection,
    });
  }

  result.sort((a, b) => b.weight - a.weight);
  return result;
}
