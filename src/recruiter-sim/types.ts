import type { ResumeJson } from '../jd-matching/types';
import type { AtsScoreResult } from '../ats-scoring/types';

export type { ResumeJson };

export type RecruiterDecision = 'Reject' | 'Maybe' | 'Shortlist';
export type RedFlagSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type StrengthLevel = 'STANDOUT' | 'STRONG' | 'NOTABLE';

export interface RedFlag {
  severity: RedFlagSeverity;
  category: string;     // machine-readable tag
  description: string;  // recruiter-voice one-liner
  evidence?: string;    // specific data point that triggered this flag
}

export interface Strength {
  level: StrengthLevel;
  category: string;
  description: string;
  evidence?: string;
}

export interface MissingRequirement {
  item: string;
  priority: 'REQUIRED' | 'PREFERRED';
  source: 'jd' | 'inferred';
}

export interface RecruiterSimInput {
  resume: ResumeJson;
  jobDescription?: string;
}

export interface RecruiterSimResult {
  shortlist_probability: number;
  recruiter_decision: RecruiterDecision;
  top_red_flags: RedFlag[];
  top_strengths: Strength[];
  missing_requirements: MissingRequirement[];
  recruiter_notes: string;

  // Full audit trail — not shown in primary UI but available for debugging/inspection
  _debug: {
    base_score: number;
    penalties: number;
    boosts: number;
    has_critical_flag: boolean;
    ats_summary: {
      overall: number;
      grade: string;
      skills: number;
      experience: number;
      projects: number;
      impact: number;
      formatting: number;
    };
  };
}

// Internal — passed to every rule function and not exposed in the public API
export interface RecruiterContext {
  resume: ResumeJson;
  jd: string;
  hasJd: boolean;
  ats: AtsScoreResult;
  skillScore: number;
  expScore: number;
  projectScore: number;
  impactScore: number;
  formattingScore: number;
  // Extracted from ATS sub_scores
  yearsCandidate: number;       // raw_value from 'Years adequacy'
  yearsRequired: number | null; // re-extracted from JD text
  companyCount: number;         // raw_value from 'Role diversity'
  metricDensity: number;        // raw_value from 'Metric density' (0–1 fraction)
  actionVerbDensity: number;    // raw_value from 'Action verb density' (0–1 fraction)
  // Extracted from skills evidence items
  missingSkills: string[];      // canonical names from negative evidence
  matchedSkills: string[];      // canonical names from positive evidence
}
