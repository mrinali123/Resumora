// ─── JD Matching Types ────────────────────────────────────────────────────────
//
// Shared types for the stateless Job Description Matching Engine.
// Designed to be independent of DB models so the engine can be called
// from any context (HTTP handler, test, CLI) without Prisma.

export interface ResumeJson {
  name: string | null;
  email: string | null;
  phone: string | null;
  skills: string[];
  education: Array<{
    institution: string;
    degree: string | null;
    startYear: string | null;
    endYear: string | null;
  }>;
  experience: Array<{
    company: string;
    role: string | null;
    duration: string | null;
    bulletPoints: string[];
  }>;
  projects: Array<{
    name: string;
    description: string | null;
    techStack: string[];
  }>;
  certifications: string[];
}

// Section classification for JD text
export type JdSectionType = 'required' | 'preferred' | 'general';

// A tech skill found in the JD, annotated with its importance signal
export interface SkillWithWeight {
  skill: string;
  weight: number;       // 0–1: section importance × log-frequency boost
  frequency: number;    // raw occurrence count across the full JD
  section: JdSectionType; // section where it appeared most prominently
}

export interface JdMatchInput {
  resume: ResumeJson;
  jobDescription: string;
  resumeEmbedding?: number[]; // optional L2-normalised full-document vector
  jdEmbedding?: number[];     // optional L2-normalised full-document vector
}

// ─── Breakdown types (one per scoring component) ──────────────────────────────

export interface SkillScoreBreakdown {
  matched_count: number;
  total_jd_skills: number;
  weighted_coverage: number; // 0–1, pre-penalty ratio
  core_penalty: number;      // raw points deducted for missing high-freq required skills
}

export interface ExperienceScoreBreakdown {
  years_required: number | null;
  years_candidate: number | null;
  years_score: number;                  // 0–100 component
  responsibility_overlap_score: number; // 0–100 component
}

export interface SemanticScoreBreakdown {
  method: 'embedding' | 'jaccard';
  raw_score: number; // pre-scaling value (0–1)
}

export interface ScoreBreakdown {
  skill_detail: SkillScoreBreakdown;
  experience_detail: ExperienceScoreBreakdown;
  semantic_detail: SemanticScoreBreakdown;
  weights_used: { skills: number; experience: number; semantic: number };
}

// ─── Final output ─────────────────────────────────────────────────────────────

export interface JdMatchResult {
  overall_match_score: number;        // 0–100 weighted composite
  skill_match_score: number;          // 0–100
  experience_match_score: number;     // 0–100
  missing_skills: string[];           // sorted by JD importance (most critical first)
  strong_matching_skills: string[];   // high-weight JD skills present in resume
  semantic_similarity_score: number;  // 0–100
  explanation: string;                // deterministic human-readable reasoning
  _breakdown: ScoreBreakdown;
}
