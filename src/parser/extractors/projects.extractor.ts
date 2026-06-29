// ─── Projects Extractor ───────────────────────────────────────────────────────

import type { ProjectEntry } from '../types';
import { BULLET_RE, TECH_LABEL_RE, PROJECT_LINK_RE } from '../utils/regex.constants';
import { splitByBlankLines, stripBullet } from '../utils/text.utils';
import { extractSkillsFromBody } from './skills.extractor';

export function extractProjects(sectionText: string): ProjectEntry[] {
  if (!sectionText?.trim()) return [];

  const blocks = splitByBlankLines(sectionText);
  return blocks
    .map(parseProjectBlock)
    .filter((p): p is ProjectEntry => !!p.name);
}

function parseProjectBlock(block: string): Partial<ProjectEntry> {
  const lines = block
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const project: Partial<ProjectEntry> = {
    name: undefined,
    description: null,
    techStack: [],
  };

  const descParts: string[] = [];

  for (const line of lines) {
    // First non-bullet line → project name
    if (!project.name && !BULLET_RE.test(line)) {
      // Strip trailing URL if present on name line
      project.name = line.replace(PROJECT_LINK_RE, '').trim();
      continue;
    }

    // Tech stack from explicit label
    if (TECH_LABEL_RE.test(line)) {
      const techStr = line.replace(TECH_LABEL_RE, '');
      const tokens = techStr
        .split(/[,|;]/)
        .map((t) => t.trim())
        .filter((t) => t.length > 1);
      (project.techStack ??= []).push(...tokens);
      continue;
    }

    // Bullet points → description
    if (BULLET_RE.test(line)) {
      descParts.push(stripBullet(line));
      continue;
    }

    // Non-bullet second line often contains a short description
    if (!BULLET_RE.test(line) && descParts.length === 0) {
      descParts.push(line);
    }
  }

  project.description = descParts.join(' ').trim() || null;

  // If no explicit tech stack label found, scan description text for known tools
  if ((project.techStack ?? []).length === 0 && project.description) {
    project.techStack = extractSkillsFromBody(
      [project.name ?? '', project.description].join(' '),
    );
  }

  return project;
}
