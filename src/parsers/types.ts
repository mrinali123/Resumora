// Shared types for the parsing pipeline.
// Designed so Phase 3 can slot in LLM-based extraction by returning the same
// interfaces from a different implementation of ParsedResumeData.

export interface Education {
  institution: string;
  degree?: string;
  field?: string;
  startDate?: string;
  endDate?: string;
  gpa?: string;
}

export interface Experience {
  company: string;
  title?: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
  bullets: string[];
}

export interface Project {
  name: string;
  description?: string;
  technologies: string[];
  url?: string;
}

// The canonical output type of any resume parser — regex, LLM, or hybrid.
export interface ParsedResumeData {
  candidateName: string | null;
  email: string | null;
  phone: string | null;
  skills: string[];
  education: Education[];
  experience: Experience[];
  projects: Project[];

  // How complete the parse was (0–1). Used in Phase 3 to decide whether
  // to re-parse with a more expensive LLM call.
  confidenceScore: number;

  // Debug payload stored in parsed_resumes.raw_output.
  // Lets us audit parser decisions and build better test fixtures.
  rawOutput: {
    sections: Record<string, string>;
    parserVersion: string;
    parsedAt: string;
  };
}

export interface ExtractedContent {
  text: string;
  wordCount: number;
  pageCount?: number;
}
