// ─── Phase 4 Analysis Types ───────────────────────────────────────────────────
//
// Single source of truth for all analysis-related interfaces.
// Kept separate from DB model types so the Phase 5 LLM layer can extend
// these interfaces with explanation fields without touching the schema.

import type { ScoringWeights } from './skills.constants';

// ─── Scores ───────────────────────────────────────────────────────────────────

export interface ComponentScores {
  skill: number;       // 0–100
  experience: number;  // 0–100
  education: number;   // 0–100
  keyword: number;     // 0–100
  semantic: number;    // 0–100
}

// ─── Gap analysis ─────────────────────────────────────────────────────────────

export type GapPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface SkillGap {
  skill: string;
  priority: GapPriority;
  // Present only when the skill was found via embedding similarity, not exact match.
  // Phase 5: use this similarity score to generate prioritised recommendations.
  semanticSimilarity?: number;
}

export interface GapAnalysisResult {
  // Skills that appear in both the resume and the job requirements (exact or semantic)
  matchingSkills: string[];
  // Required skills (REQUIREMENTS section) with no match in the resume
  missingRequiredSkills: string[];
  // Preferred skills (QUALIFICATIONS/NICE-TO-HAVE) missing from the resume
  missingPreferredSkills: string[];
  // Required skills matched semantically (similarity > threshold), not verbatim
  semanticMatches: string[];
  // Structured gaps with priority for the recommendations engine (Phase 5)
  skillGaps: SkillGap[];
}

// ─── Keyword coverage ─────────────────────────────────────────────────────────

export interface KeywordCoverage {
  covered: string[];    // tech keywords from JD that appear in resume
  missing: string[];    // tech keywords from JD absent from resume
  coverageRate: number; // covered / (covered + missing), 0–1
}

// ─── Strengths ────────────────────────────────────────────────────────────────

export interface StrengthItem {
  chunkType: string;   // EXPERIENCE | PROJECT | SKILLS | …
  content: string;
  // Cosine similarity to the job's REQUIREMENTS/FULL chunks (0–1)
  // Phase 5: use this to explain *why* this section is a strength
  relevanceScore: number;
  metadata: Record<string, unknown>;
}

// ─── Full analysis result ─────────────────────────────────────────────────────

export interface AnalysisResult {
  // null if save: false was passed to MatchingService.analyze()
  id: string | null;

  resumeId: string;
  jobId: string;

  // ATS scores
  atsScore: number;      // overall weighted score
  skillScore: number;
  experienceScore: number;
  educationScore: number;
  keywordScore: number;
  semanticScore: number;

  // Gap analysis
  matchingSkills: string[];
  missingRequiredSkills: string[];
  missingPreferredSkills: string[];

  // Top resume sections most aligned with this job
  strengths: StrengthItem[];

  // Keyword coverage detail
  keywordCoverage: KeywordCoverage;

  // Metadata
  scoringVersion: string;
  // false = embedding API unavailable; experience + semantic scores are approximate
  embeddingsUsed: boolean;
  weights: ScoringWeights;
  analyzedAt: string;
}

// ─── Job ranking ──────────────────────────────────────────────────────────────

export interface JobRanking {
  job: {
    id: string;
    title: string;
    company: string | null;
    createdAt: Date;
  };
  analysisId: string | null;
  // null if no analysis exists for this job
  matchScore: number | null;
  skillOverlap: string[];
  missingSkills: string[];
  analyzedAt: string | null;
}

// ─── Resume strength (job-agnostic) ──────────────────────────────────────────

export interface IntrinsicStrengthItem {
  chunkType: string;
  content: string;
  // Intrinsic quality score based on depth, seniority markers, technology count
  strengthScore: number;
  metadata: Record<string, unknown>;
}

export interface ResumeStrength {
  strongestSkills: string[];
  strongestExperience: IntrinsicStrengthItem[];
  strongestProjects: IntrinsicStrengthItem[];
  overallStrengthScore: number; // 0–100, proxy for resume "completeness + depth"
}

// ─── Analysis history ─────────────────────────────────────────────────────────

export interface AnalysisHistoryItem {
  id: string;
  resumeId: string;
  jobId: string;
  atsScore: number;
  skillScore: number;
  experienceScore: number;
  educationScore: number;
  matchingSkills: string[];
  missingRequiredSkills: string[];
  embeddingsUsed: boolean;
  scoringVersion: string;
  createdAt: Date;
  resume: { id: string; title: string } | null;
  job: { id: string; title: string; company: string | null } | null;
}
