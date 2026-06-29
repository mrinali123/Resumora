import { compare_resumes } from '../../../src/resume-comparison';
import type { ResumeComparisonResult, ResumeJson } from '../../../src/resume-comparison';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// Version A: older, weaker resume
const RESUME_A: ResumeJson = {
  name: 'Mrinali Parida',
  email: 'mrinali@example.com',
  phone: null,
  skills: ['JavaScript', 'React', 'Node.js', 'PostgreSQL'],
  education: [
    { institution: 'NIT Rourkela', degree: 'B.Tech Computer Science', startYear: '2018', endYear: '2022' },
  ],
  experience: [
    {
      company: 'TechCorp India',
      role: 'Software Engineer',
      duration: 'Jan 2023 – Present',
      bulletPoints: [
        'Worked on microservices platform',
        'Helped with Redis caching implementation',
        'Participated in code reviews',
      ],
    },
  ],
  projects: [
    {
      name: 'Resume Analyzer',
      description: 'A resume tool',
      techStack: ['Node.js', 'PostgreSQL'],
    },
  ],
  certifications: [],
};

// Version B: improved resume with quantification, new skills, new role
const RESUME_B: ResumeJson = {
  name: 'Mrinali Parida',
  email: 'mrinali@example.com',
  phone: '+91 98765 43210',
  skills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Redis', 'Docker', 'AWS'],
  education: [
    { institution: 'NIT Rourkela', degree: 'B.Tech Computer Science', startYear: '2018', endYear: '2022' },
  ],
  experience: [
    {
      company: 'TechCorp India',
      role: 'Senior Software Engineer',
      duration: 'Jan 2023 – Present',
      bulletPoints: [
        'Led microservices platform serving 2M+ users with 99.9% uptime',
        'Reduced API latency by 40% via Redis caching strategy',
        'Mentored 3 junior developers, improving team velocity by 25%',
        'Deployed containerised workloads reducing deployment time from 45 to 8 minutes',
      ],
    },
    {
      company: 'StartupXYZ',
      role: 'Software Engineer',
      duration: 'June 2021 – December 2022',
      bulletPoints: [
        'Built React dashboard with real-time updates for 50K daily active users',
        'Designed multi-tenant PostgreSQL schema supporting 12 enterprise clients',
      ],
    },
  ],
  projects: [
    {
      name: 'Resume Analyzer',
      description: 'End-to-end resume parsing and semantic job matching platform with 2K+ monthly users',
      techStack: ['Node.js', 'PostgreSQL', 'pgvector', 'TypeScript'],
    },
    {
      name: 'Open Source CLI',
      description: 'Developer productivity tool with 2,000+ GitHub stars',
      techStack: ['Go', 'Cobra'],
    },
  ],
  certifications: ['AWS Certified Solutions Architect – Associate'],
};

// Identical resume pair (no changes)
const RESUME_IDENTICAL: ResumeJson = { ...RESUME_A };

// Regression: B removes skills and experience
const RESUME_REGRESSION: ResumeJson = {
  ...RESUME_A,
  skills: ['JavaScript'], // removed React, Node.js, PostgreSQL
  experience: [],          // removed all experience
};

const STRONG_JD = `
Senior Software Engineer — Backend Platform

Requirements
- 3+ years of experience
- TypeScript and Node.js required
- PostgreSQL and Redis for persistence and caching
- Docker and AWS cloud experience

Responsibilities
- Build and maintain distributed systems
- Optimise API performance
`;

// ─── Output shape ─────────────────────────────────────────────────────────────

describe('compare_resumes — output shape', () => {
  let result: ResumeComparisonResult;

  beforeAll(() => {
    result = compare_resumes({ resumeA: RESUME_A, resumeB: RESUME_B, jobDescription: STRONG_JD });
  });

  it('returns all required top-level fields', () => {
    expect(result).toMatchObject({
      improvement_score_delta: expect.any(Number),
      added_skills: expect.any(Array),
      removed_skills: expect.any(Array),
      improved_sections: expect.any(Array),
      ats_score_change: expect.any(Number),
      explanation: expect.any(String),
      recruiter_summary: expect.any(String),
    });
  });

  it('improvement_score_delta equals ats_score_change', () => {
    expect(result.improvement_score_delta).toBe(result.ats_score_change);
  });

  it('ats.delta equals improvement_score_delta', () => {
    expect(result.ats.delta).toBe(result.improvement_score_delta);
  });

  it('ats.score_b - ats.score_a equals delta', () => {
    expect(result.ats.score_b - result.ats.score_a).toBe(result.ats.delta);
  });

  it('improved_sections covers expected section names', () => {
    const names = result.improved_sections.map((s) => s.section);
    expect(names).toContain('skills');
    expect(names).toContain('experience');
    expect(names).toContain('projects');
  });

  it('each improved_section has required fields', () => {
    for (const s of result.improved_sections) {
      expect(typeof s.section).toBe('string');
      expect(['improved', 'regressed', 'unchanged']).toContain(s.change);
      expect(typeof s.summary).toBe('string');
      expect(typeof s.is_meaningful).toBe('boolean');
      expect(Array.isArray(s.details)).toBe(true);
    }
  });

  it('explanation is a non-empty string', () => {
    expect(result.explanation.length).toBeGreaterThan(20);
  });

  it('recruiter_summary has 3 paragraphs', () => {
    const paragraphs = result.recruiter_summary.split('\n\n').filter((p) => p.trim());
    expect(paragraphs.length).toBe(3);
  });
});

// ─── Skill detection ──────────────────────────────────────────────────────────

describe('compare_resumes — skill delta', () => {
  let result: ResumeComparisonResult;

  beforeAll(() => {
    result = compare_resumes({ resumeA: RESUME_A, resumeB: RESUME_B, jobDescription: STRONG_JD });
  });

  it('detects added skills', () => {
    expect(result.added_skills.length).toBeGreaterThan(0);
    // TypeScript, Redis, Docker, AWS were added
    const lower = result.added_skills.map((s) => s.toLowerCase());
    expect(lower.some((s) => s.includes('typescript') || s.includes('docker') || s.includes('redis'))).toBe(true);
  });

  it('no skills were removed', () => {
    expect(result.removed_skills).toHaveLength(0);
  });

  it('identifies JD-relevant added skills', () => {
    // TypeScript, Redis, Docker, AWS are all in the JD
    expect(result.skill_delta.jd_relevant_added.length).toBeGreaterThan(0);
  });

  it('count_delta is positive when skills were added', () => {
    expect(result.skill_delta.count_delta).toBeGreaterThan(0);
  });

  it('retained includes all A skills still present in B', () => {
    // JavaScript, React, Node.js, PostgreSQL all still in B
    expect(result.skill_delta.retained.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── Experience delta ─────────────────────────────────────────────────────────

describe('compare_resumes — experience delta', () => {
  let result: ResumeComparisonResult;

  beforeAll(() => {
    result = compare_resumes({ resumeA: RESUME_A, resumeB: RESUME_B });
  });

  it('detects the new role at StartupXYZ', () => {
    expect(result.experience_delta.new_roles).toContain('StartupXYZ');
  });

  it('detects no removed roles', () => {
    expect(result.experience_delta.removed_roles).toHaveLength(0);
  });

  it('TechCorp entry is classified as modified', () => {
    const techcorp = result.experience_delta.entries.find(
      (e) => e.company.toLowerCase().includes('techcorp'),
    );
    expect(techcorp).toBeDefined();
    expect(techcorp!.change_type).toBe('modified');
  });

  it('detects quantification improvements in TechCorp bullets', () => {
    // A: "Worked on microservices platform" (no metrics)
    // B: "Led microservices platform serving 2M+ users with 99.9% uptime" (has metrics)
    expect(result.experience_delta.quantification_improvements).toBeGreaterThan(0);
  });

  it('total bullet delta is positive', () => {
    expect(result.experience_delta.total_bullets_delta).toBeGreaterThan(0);
  });
});

// ─── Project delta ────────────────────────────────────────────────────────────

describe('compare_resumes — project delta', () => {
  let result: ResumeComparisonResult;

  beforeAll(() => {
    result = compare_resumes({ resumeA: RESUME_A, resumeB: RESUME_B });
  });

  it('detects the new Open Source CLI project', () => {
    expect(result.project_delta.new_projects).toContain('Open Source CLI');
  });

  it('detects Resume Analyzer as improved (tech added, description improved)', () => {
    const ra = result.project_delta.entries.find((e) =>
      e.name.toLowerCase().includes('resume'),
    );
    expect(ra).toBeDefined();
    expect(ra!.change_type).toBe('improved');
  });

  it('total tech delta is positive', () => {
    expect(result.project_delta.total_tech_delta).toBeGreaterThan(0);
  });
});

// ─── ATS scoring ──────────────────────────────────────────────────────────────

describe('compare_resumes — ATS comparison', () => {
  let result: ResumeComparisonResult;

  beforeAll(() => {
    result = compare_resumes({ resumeA: RESUME_A, resumeB: RESUME_B, jobDescription: STRONG_JD });
  });

  it('ATS score improves from A to B', () => {
    expect(result.ats.score_b).toBeGreaterThan(result.ats.score_a);
  });

  it('improvement_score_delta is positive', () => {
    expect(result.improvement_score_delta).toBeGreaterThan(0);
  });

  it('has component deltas for all 5 ATS components', () => {
    expect(result.ats.component_deltas).toHaveLength(5);
    const components = result.ats.component_deltas.map((d) => d.component);
    expect(components).toContain('skills_match');
    expect(components).toContain('experience_relevance');
    expect(components).toContain('project_strength');
    expect(components).toContain('formatting_quality');
    expect(components).toContain('impact_metrics');
  });

  it('skills_match component improved (more skills match JD)', () => {
    const skillsComp = result.ats.component_deltas.find(
      (d) => d.component === 'skills_match',
    )!;
    expect(skillsComp.delta).toBeGreaterThan(0);
  });

  it('jd_used is true when JD was provided', () => {
    expect(result.ats.jd_used).toBe(true);
  });

  it('is_meaningful_upgrade is true for significant improvement', () => {
    expect(result.is_meaningful_upgrade).toBe(true);
  });

  it('has_regressions is false when everything improved', () => {
    expect(result.has_regressions).toBe(false);
  });
});

// ─── Identical resumes ────────────────────────────────────────────────────────

describe('compare_resumes — identical resumes', () => {
  let result: ResumeComparisonResult;

  beforeAll(() => {
    result = compare_resumes({ resumeA: RESUME_A, resumeB: RESUME_IDENTICAL });
  });

  it('improvement_score_delta is 0', () => {
    expect(result.improvement_score_delta).toBe(0);
  });

  it('added_skills is empty', () => {
    expect(result.added_skills).toHaveLength(0);
  });

  it('removed_skills is empty', () => {
    expect(result.removed_skills).toHaveLength(0);
  });

  it('experience delta has no new or removed roles', () => {
    expect(result.experience_delta.new_roles).toHaveLength(0);
    expect(result.experience_delta.removed_roles).toHaveLength(0);
  });

  it('is_meaningful_upgrade is false', () => {
    expect(result.is_meaningful_upgrade).toBe(false);
  });

  it('all sections are unchanged', () => {
    for (const s of result.improved_sections) {
      expect(s.change).toBe('unchanged');
    }
  });
});

// ─── Regression scenario ──────────────────────────────────────────────────────

describe('compare_resumes — regression scenario', () => {
  let result: ResumeComparisonResult;

  beforeAll(() => {
    result = compare_resumes({ resumeA: RESUME_A, resumeB: RESUME_REGRESSION });
  });

  it('improvement_score_delta is negative', () => {
    expect(result.improvement_score_delta).toBeLessThan(0);
  });

  it('detects removed skills', () => {
    expect(result.removed_skills.length).toBeGreaterThan(0);
  });

  it('has_regressions is true', () => {
    expect(result.has_regressions).toBe(true);
  });

  it('experience section is regressed', () => {
    const expSection = result.improved_sections.find((s) => s.section === 'experience');
    expect(expSection?.change).toBe('regressed');
  });

  it('recruiter_summary mentions the regression', () => {
    expect(result.recruiter_summary.toLowerCase()).toMatch(/weak|regress|drop|declin/);
  });
});

// ─── No JD scenario ───────────────────────────────────────────────────────────

describe('compare_resumes — without JD', () => {
  let result: ResumeComparisonResult;

  beforeAll(() => {
    result = compare_resumes({ resumeA: RESUME_A, resumeB: RESUME_B });
  });

  it('jd_used is false', () => {
    expect(result.ats.jd_used).toBe(false);
  });

  it('jd_relevant_added is empty when no JD', () => {
    expect(result.skill_delta.jd_relevant_added).toHaveLength(0);
  });

  it('still computes a valid score delta', () => {
    expect(typeof result.improvement_score_delta).toBe('number');
  });

  it('explanation notes that no JD was provided', () => {
    expect(result.explanation.toLowerCase()).toMatch(/no jd|jd-agnostic/);
  });
});

// ─── Section classification ───────────────────────────────────────────────────

describe('compare_resumes — section classification', () => {
  let result: ResumeComparisonResult;

  beforeAll(() => {
    result = compare_resumes({ resumeA: RESUME_A, resumeB: RESUME_B, jobDescription: STRONG_JD });
  });

  it('skills section is meaningful and improved', () => {
    const s = result.improved_sections.find((x) => x.section === 'skills')!;
    expect(s.change).toBe('improved');
    expect(s.is_meaningful).toBe(true);
  });

  it('experience section is meaningful and improved', () => {
    const s = result.improved_sections.find((x) => x.section === 'experience')!;
    expect(s.change).toBe('improved');
    expect(s.is_meaningful).toBe(true);
  });

  it('projects section is meaningful and improved', () => {
    const s = result.improved_sections.find((x) => x.section === 'projects')!;
    expect(s.change).toBe('improved');
    expect(s.is_meaningful).toBe(true);
  });

  it('certifications section detected as improved (new cert added)', () => {
    const s = result.improved_sections.find((x) => x.section === 'certifications')!;
    expect(s.change).toBe('improved');
  });

  it('each meaningful section has at least one detail', () => {
    for (const s of result.improved_sections.filter((x) => x.is_meaningful)) {
      expect(s.details.length).toBeGreaterThan(0);
    }
  });
});

// ─── Bullet change classification ─────────────────────────────────────────────

describe('compare_resumes — bullet change types', () => {
  let result: ResumeComparisonResult;

  beforeAll(() => {
    result = compare_resumes({ resumeA: RESUME_A, resumeB: RESUME_B });
  });

  it('some bullets are classified as quantified', () => {
    const allChanges = result.experience_delta.entries.flatMap((e) => e.bullet_changes);
    const quantified = allChanges.filter((c) => c.type === 'quantified');
    expect(quantified.length).toBeGreaterThan(0);
  });

  it('some bullets are classified as added', () => {
    const allChanges = result.experience_delta.entries.flatMap((e) => e.bullet_changes);
    const added = allChanges.filter((c) => c.type === 'added');
    expect(added.length).toBeGreaterThan(0);
  });

  it('quantified bullets have text_a and text_b', () => {
    const allChanges = result.experience_delta.entries.flatMap((e) => e.bullet_changes);
    for (const c of allChanges.filter((x) => x.type === 'quantified')) {
      expect(c.text_a).toBeDefined();
      expect(c.text_b).toBeDefined();
    }
  });
});
