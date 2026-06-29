// ─── Resume Version Comparison Types ─────────────────────────────────────────
//
// All fields are computed deterministically.
// The only LLM-eligible hook is `recruiter_summary` polish (optional overlay),
// but the string is fully populated by template logic with no LLM dependency.

export type { ResumeJson } from '../jd-matching/types';

// ─── Input ────────────────────────────────────────────────────────────────────

import type { ResumeJson } from '../jd-matching/types';

export interface ResumeComparisonInput {
  resumeA: ResumeJson;       // earlier / original version
  resumeB: ResumeJson;       // newer / revised version
  jobDescription?: string;   // optional — enables JD-aware ATS scoring and
                             // surfaces which added skills hit the JD
}

// ─── Skill delta ──────────────────────────────────────────────────────────────

export interface SkillDelta {
  added: string[];              // canonical names in B but not A
  removed: string[];            // canonical names in A but not B
  retained: string[];           // canonical names in both
  count_delta: number;          // B.skills - A.skills (can be negative)
  jd_relevant_added: string[];  // subset of added that appear in JD
}

// ─── Experience delta ─────────────────────────────────────────────────────────

export type BulletChangeType =
  | 'added'       // bullet exists in B only (no close match in A)
  | 'removed'     // bullet exists in A only (no close match in B)
  | 'quantified'  // same bullet, but B version added numeric metrics
  | 'expanded'    // same bullet, but B version is significantly longer
  | 'unchanged';  // essentially identical

export interface BulletChange {
  type: BulletChangeType;
  // For 'added' / 'removed': the relevant version's text
  // For 'quantified' / 'expanded': the B version
  // For 'unchanged': either (they're the same)
  text: string;
  text_a?: string;   // original (for quantified/expanded)
  text_b?: string;   // revised (for quantified/expanded)
}

export interface ExperienceEntryDelta {
  company: string;
  role_a: string | null;
  role_b: string | null;
  change_type: 'added' | 'removed' | 'modified' | 'unchanged';
  bullet_changes: BulletChange[];
  bullets_added: number;
  bullets_removed: number;
  bullets_quantified: number; // previously unquantified bullets that gained metrics
  bullets_expanded: number;   // bullets that grew significantly in length
}

export interface ExperienceDelta {
  entries: ExperienceEntryDelta[];
  new_roles: string[];
  removed_roles: string[];
  total_bullets_a: number;
  total_bullets_b: number;
  total_bullets_delta: number;
  quantification_improvements: number;
}

// ─── Project delta ────────────────────────────────────────────────────────────

export interface ProjectEntryDelta {
  name: string;
  change_type: 'added' | 'removed' | 'improved' | 'unchanged';
  new_tech: string[];
  removed_tech: string[];
  description_improved: boolean; // B description is substantially better
  metrics_added: boolean;        // B description added quantified impact
}

export interface ProjectDelta {
  entries: ProjectEntryDelta[];
  new_projects: string[];
  removed_projects: string[];
  total_tech_a: number;
  total_tech_b: number;
  total_tech_delta: number;
}

// ─── Section-level summary ────────────────────────────────────────────────────

export type SectionName =
  | 'skills'
  | 'experience'
  | 'projects'
  | 'certifications'
  | 'education';

export type SectionChangeDirection = 'improved' | 'regressed' | 'unchanged';

export interface ImprovedSection {
  section: SectionName;
  change: SectionChangeDirection;
  ats_score_delta: number | null;  // ATS component score B − A (null if no JD)
  summary: string;                 // one-line deterministic description
  details: string[];               // bullet-level detail points
  is_meaningful: boolean;          // false = trivial diff (whitespace, minor reword)
}

// ─── ATS comparison ───────────────────────────────────────────────────────────

export interface ComponentDelta {
  component: string;  // AtsComponent key
  name: string;
  score_a: number;
  score_b: number;
  delta: number;      // score_b − score_a
}

export interface AtsComparison {
  score_a: number;
  score_b: number;
  delta: number;             // score_b − score_a
  grade_a: string;
  grade_b: string;
  component_deltas: ComponentDelta[];
  jd_used: boolean;
}

// ─── Final output ─────────────────────────────────────────────────────────────

export interface ResumeComparisonResult {
  // ── Required output shape ────────────────────────────────────────────────
  improvement_score_delta: number;   // ATS score B − A (overall)
  added_skills: string[];            // canonical names of newly added skills
  removed_skills: string[];          // canonical names of removed skills
  improved_sections: ImprovedSection[];
  ats_score_change: number;          // same value as improvement_score_delta
  explanation: string;               // concise deterministic paragraph

  // ── Rich detail (for UI / audit) ─────────────────────────────────────────
  skill_delta: SkillDelta;
  experience_delta: ExperienceDelta;
  project_delta: ProjectDelta;
  ats: AtsComparison;
  recruiter_summary: string;    // "What improved and what still needs work"
  has_regressions: boolean;     // true if any dimension got worse
  is_meaningful_upgrade: boolean; // true if the revision materially improves ATS fitness
}
