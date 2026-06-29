// ─── Explainable ATS Scoring Types ───────────────────────────────────────────
//
// Every score is accompanied by:
//   - sub_scores: the individual signals that were computed and combined
//   - evidence:   specific items extracted from the resume or JD that justify the number
//   - explanation: a human-readable sentence derived from the above (no LLM)
//
// Nothing here is a black box: the overall_score is a documented weighted sum,
// every component has a documented formula, and the evidence array can be
// displayed directly in a UI to explain why a candidate scored the way they did.

// Re-export the shared resume shape so callers have a single import
export type { ResumeJson } from '../jd-matching/types';

// ─── Evidence ─────────────────────────────────────────────────────────────────

export type EvidenceSource = 'resume' | 'jd' | 'both';
export type EvidencePolarity = 'positive' | 'negative' | 'neutral';

export interface EvidenceItem {
  // Machine-readable tag for the UI to style or group evidence
  type:
    | 'matched_skill'
    | 'missing_skill'
    | 'overlap_keyword'
    | 'metric_bullet'
    | 'action_verb'
    | 'format_check'
    | 'project_entry'
    | 'years_comparison'
    | 'seniority_signal'
    | 'scale_indicator';
  label: string;          // short display label, e.g. "Matched skill"
  value: string;          // the actual evidence string, e.g. "TypeScript"
  source: EvidenceSource;
  polarity: EvidencePolarity;
}

// ─── Sub-scores ───────────────────────────────────────────────────────────────

export interface SubScore {
  name: string;
  raw_value: number;  // the raw computed signal (could be ratio, count, etc.)
  score: number;      // 0–100, normalised
  weight: number;     // relative weight within this component (must sum to 1.0)
  formula: string;    // one-line description of how score was computed
}

// ─── Component scores ─────────────────────────────────────────────────────────

export type AtsComponent =
  | 'skills_match'
  | 'experience_relevance'
  | 'project_strength'
  | 'formatting_quality'
  | 'impact_metrics';

export interface ComponentScore {
  component: AtsComponent;
  name: string;           // human-readable display name
  weight: number;         // fraction of overall score, e.g. 0.40
  raw_score: number;      // 0–100
  weighted_score: number; // raw_score × weight (contribution to overall)
  explanation: string;    // deterministic one-paragraph justification
  evidence: EvidenceItem[];
  sub_scores: SubScore[];
}

// ─── Final result ─────────────────────────────────────────────────────────────

export type AtsGrade = 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F';

export interface AtsScoreResult {
  overall_score: number;    // 0–100, weighted sum of all components
  grade: AtsGrade;
  components: ComponentScore[];
  strengths: string[];           // 2–3 concrete strengths backed by evidence
  improvement_areas: string[];   // 2–3 specific, actionable gaps
  summary: string;               // one-paragraph narrative (deterministic)
}
