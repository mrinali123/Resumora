// Maps a DB ParsedResume row to the ResumeJson shape expected by the
// stateless analysis engines (ats-scoring, jd-matching, recruiter-sim,
// resume-comparison).
//
// The DB columns are typed as Prisma's `Json` (= unknown at runtime), so
// each field is cast defensively with Array.isArray guards.

import type { ParsedResume } from '@prisma/client';
import type { ResumeJson } from '../jd-matching/types';

export function toResumeJson(p: ParsedResume): ResumeJson {
  const skills         = Array.isArray(p.skills)         ? (p.skills         as string[])  : [];
  const certifications = Array.isArray(p.certifications) ? (p.certifications as string[])  : [];
  const education      = Array.isArray(p.education)      ? (p.education      as Record<string, unknown>[]) : [];
  const experience     = Array.isArray(p.experience)     ? (p.experience     as Record<string, unknown>[]) : [];
  const projects       = Array.isArray(p.projects)       ? (p.projects       as Record<string, unknown>[]) : [];

  return {
    name:  (p.candidateName ?? '') as string,
    email: (p.email  ?? null) as string | null,
    phone: (p.phone  ?? null) as string | null,
    skills,
    certifications,
    education: education.map((e) => ({
      institution: String(e['institution'] ?? ''),
      degree:      String(e['degree']      ?? ''),
      startYear:   e['startYear'] != null ? String(e['startYear']) : null,
      endYear:     e['endYear']   != null ? String(e['endYear'])   : null,
    })),
    experience: experience.map((e) => ({
      company:      String(e['company']  ?? ''),
      role:         String(e['role']     ?? ''),
      duration:     String(e['duration'] ?? ''),
      bulletPoints: Array.isArray(e['bulletPoints'])
        ? (e['bulletPoints'] as unknown[]).map(String)
        : [],
    })),
    projects: projects.map((p) => ({
      name:        String(p['name']        ?? ''),
      description: p['description'] != null ? String(p['description']) : null,
      techStack:   Array.isArray(p['techStack'])
        ? (p['techStack'] as unknown[]).map(String)
        : [],
    })),
  };
}
