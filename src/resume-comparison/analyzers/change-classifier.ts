// ─── Change Classifier ────────────────────────────────────────────────────────
//
// Converts raw comparison deltas into `ImprovedSection[]` with:
//   - a deterministic `is_meaningful` flag (documented thresholds, not vibes)
//   - a one-line `summary` string
//   - specific `details[]` for rendering a change list
//
// "Meaningful" thresholds — each threshold is documented here so they're
// easy to tune without touching the scoring logic:

// Skills:    ≥ 2 skills added OR any JD-relevant skills added OR (skills added > 0 AND count_delta > 0 meaning net positive)
// Experience: ≥ 1 new role added OR ≥ 2 bullets added OR ≥ 1 bullet quantified
// Projects:   ≥ 1 project added OR ≥ 1 project improved (tech grew or desc improved)
// Certs:      any new certification added
// ATS score: component delta ≥ 3 points is treated as meaningful by the caller

import type {
  SkillDelta,
  ExperienceDelta,
  ProjectDelta,
  ImprovedSection,
  SectionChangeDirection,
} from '../types';
import type { ResumeJson } from '../../jd-matching/types';
import type { ComponentDelta } from '../types';

// ─── Thresholds (all in one place) ───────────────────────────────────────────

const MEANINGFUL_SKILLS_ADDED = 2;
const MEANINGFUL_BULLETS_ADDED = 2;
const MEANINGFUL_COMPONENT_DELTA = 3; // ATS component score points

// ─── Skills section ───────────────────────────────────────────────────────────

export function classifySkillsSection(
  delta: SkillDelta,
  componentDelta: ComponentDelta | undefined,
): ImprovedSection {
  const netPositive = delta.count_delta > 0;
  const netNegative = delta.count_delta < 0 && delta.added.length === 0;

  const isMeaningful =
    delta.added.length >= MEANINGFUL_SKILLS_ADDED ||
    delta.jd_relevant_added.length > 0 ||
    netNegative; // meaningful regression

  const change: SectionChangeDirection = netNegative
    ? 'regressed'
    : delta.added.length > 0
      ? 'improved'
      : 'unchanged';

  const details: string[] = [];

  if (delta.added.length > 0) {
    details.push(`+${delta.added.length} skill(s) added: ${delta.added.join(', ')}`);
  }
  if (delta.jd_relevant_added.length > 0) {
    details.push(`JD-relevant additions: ${delta.jd_relevant_added.join(', ')}`);
  }
  if (delta.removed.length > 0) {
    details.push(`−${delta.removed.length} skill(s) removed: ${delta.removed.join(', ')}`);
  }

  const summary = netNegative
    ? `Skills section regressed: net ${Math.abs(delta.count_delta)} skill(s) removed`
    : delta.added.length > 0
      ? `${delta.added.length} skill(s) added (net: ${delta.count_delta >= 0 ? '+' : ''}${delta.count_delta})`
      : 'No skill changes detected';

  return {
    section: 'skills',
    change,
    ats_score_delta: componentDelta?.delta ?? null,
    summary,
    details,
    is_meaningful: isMeaningful,
  };
}

// ─── Experience section ───────────────────────────────────────────────────────

export function classifyExperienceSection(
  delta: ExperienceDelta,
  componentDelta: ComponentDelta | undefined,
): ImprovedSection {
  const hasNewRoles = delta.new_roles.length > 0;
  const hasRemovedRoles = delta.removed_roles.length > 0;
  const enoughNewBullets = delta.total_bullets_delta >= MEANINGFUL_BULLETS_ADDED;
  const hasQuantification = delta.quantification_improvements > 0;

  const isMeaningful =
    hasNewRoles ||
    enoughNewBullets ||
    hasQuantification ||
    hasRemovedRoles;

  const positiveSignals =
    delta.new_roles.length +
    Math.max(0, delta.total_bullets_delta) +
    delta.quantification_improvements;
  const negativeSignals = delta.removed_roles.length;

  const change: SectionChangeDirection =
    positiveSignals > negativeSignals
      ? 'improved'
      : positiveSignals < negativeSignals
        ? 'regressed'
        : 'unchanged';

  const details: string[] = [];
  if (hasNewRoles) details.push(`New role(s) added: ${delta.new_roles.join(', ')}`);
  if (hasRemovedRoles) details.push(`Role(s) removed: ${delta.removed_roles.join(', ')}`);
  if (delta.total_bullets_delta !== 0) {
    details.push(
      `Bullet point count: ${delta.total_bullets_a} → ${delta.total_bullets_b} (${delta.total_bullets_delta >= 0 ? '+' : ''}${delta.total_bullets_delta})`,
    );
  }
  if (hasQuantification) {
    details.push(`${delta.quantification_improvements} bullet(s) gained quantified metrics`);
  }

  const summary = hasNewRoles
    ? `${delta.new_roles.length} new role(s); ${delta.total_bullets_delta >= 0 ? '+' : ''}${delta.total_bullets_delta} bullet(s) overall`
    : hasQuantification
      ? `${delta.quantification_improvements} bullet(s) quantified; net ${delta.total_bullets_delta >= 0 ? '+' : ''}${delta.total_bullets_delta} bullets`
      : delta.total_bullets_delta !== 0
        ? `Net ${delta.total_bullets_delta >= 0 ? '+' : ''}${delta.total_bullets_delta} bullet point(s)`
        : 'Experience section unchanged';

  return {
    section: 'experience',
    change,
    ats_score_delta: componentDelta?.delta ?? null,
    summary,
    details,
    is_meaningful: isMeaningful,
  };
}

// ─── Projects section ─────────────────────────────────────────────────────────

export function classifyProjectsSection(
  delta: ProjectDelta,
  componentDelta: ComponentDelta | undefined,
): ImprovedSection {
  const hasNewProjects = delta.new_projects.length > 0;
  const hasRemovedProjects = delta.removed_projects.length > 0;
  const hasImproved = delta.entries.some(
    (e) => e.change_type === 'improved',
  );

  const isMeaningful = hasNewProjects || hasImproved || hasRemovedProjects;

  const change: SectionChangeDirection =
    hasNewProjects || hasImproved
      ? 'improved'
      : hasRemovedProjects
        ? 'regressed'
        : 'unchanged';

  const details: string[] = [];

  if (hasNewProjects) {
    details.push(`New project(s): ${delta.new_projects.join(', ')}`);
  }
  if (hasRemovedProjects) {
    details.push(`Removed project(s): ${delta.removed_projects.join(', ')}`);
  }

  for (const e of delta.entries.filter((x) => x.change_type === 'improved')) {
    const techs =
      e.new_tech.length > 0
        ? `+${e.new_tech.length} tech (${e.new_tech.join(', ')})`
        : '';
    const desc = e.description_improved ? 'description improved' : '';
    const metrics = e.metrics_added ? 'metrics added' : '';
    const changes = [techs, desc, metrics].filter(Boolean).join('; ');
    if (changes) details.push(`${e.name}: ${changes}`);
  }

  if (delta.total_tech_delta !== 0) {
    details.push(
      `Total tech entries: ${delta.total_tech_a} → ${delta.total_tech_b} (${delta.total_tech_delta >= 0 ? '+' : ''}${delta.total_tech_delta})`,
    );
  }

  const summary =
    hasNewProjects
      ? `${delta.new_projects.length} new project(s) added`
      : hasImproved
        ? `${delta.entries.filter((e) => e.change_type === 'improved').length} project(s) improved`
        : hasRemovedProjects
          ? `${delta.removed_projects.length} project(s) removed`
          : 'Projects section unchanged';

  return {
    section: 'projects',
    change,
    ats_score_delta: componentDelta?.delta ?? null,
    summary,
    details,
    is_meaningful: isMeaningful,
  };
}

// ─── Certifications section ───────────────────────────────────────────────────

export function classifyCertificationsSection(
  resumeA: ResumeJson,
  resumeB: ResumeJson,
): ImprovedSection {
  const setA = new Set(resumeA.certifications.map((c) => c.toLowerCase().trim()));
  const setB = new Set(resumeB.certifications.map((c) => c.toLowerCase().trim()));

  const added = resumeB.certifications.filter((c) => !setA.has(c.toLowerCase().trim()));
  const removed = resumeA.certifications.filter((c) => !setB.has(c.toLowerCase().trim()));

  const change: SectionChangeDirection =
    added.length > removed.length
      ? 'improved'
      : removed.length > added.length
        ? 'regressed'
        : 'unchanged';

  const details: string[] = [];
  if (added.length > 0) details.push(`Added: ${added.join('; ')}`);
  if (removed.length > 0) details.push(`Removed: ${removed.join('; ')}`);

  return {
    section: 'certifications',
    change,
    ats_score_delta: null,
    summary:
      added.length > 0
        ? `${added.length} certification(s) added`
        : removed.length > 0
          ? `${removed.length} certification(s) removed`
          : 'No certification changes',
    details,
    is_meaningful: added.length > 0 || removed.length > 0,
  };
}

// ─── ATS-delta based override ─────────────────────────────────────────────────
// Marks a section as meaningful if its ATS component improved by ≥ threshold
// even if the raw content delta didn't cross the content-based threshold.

export function applyAtsDeltaThreshold(
  sections: ImprovedSection[],
): void {
  for (const s of sections) {
    if (
      s.ats_score_delta !== null &&
      Math.abs(s.ats_score_delta) >= MEANINGFUL_COMPONENT_DELTA
    ) {
      s.is_meaningful = true;
    }
  }
}
