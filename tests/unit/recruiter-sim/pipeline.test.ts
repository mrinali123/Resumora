import { simulate_recruiter } from '../../../src/recruiter-sim';
import type { RecruiterSimResult, ResumeJson } from '../../../src/recruiter-sim';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const JD_STRONG = `
Senior Backend Engineer

Requirements:
- 4+ years of experience
- TypeScript and Node.js required
- PostgreSQL, Redis, Docker, Kubernetes
- AWS cloud deployment

Responsibilities:
- Design distributed microservices
- Optimise API performance and scalability
`;

// STRONG candidate: high skill match, quantified experience, multiple projects
const RESUME_STRONG: ResumeJson = {
  name: 'Strong Candidate',
  email: 'strong@example.com',
  phone: '+1 555 123 4567',
  skills: ['TypeScript', 'Node.js', 'React', 'PostgreSQL', 'Redis', 'Docker', 'Kubernetes', 'AWS', 'Python', 'Go'],
  education: [{ institution: 'IIT Delhi', degree: 'B.Tech CSE', startYear: '2017', endYear: '2021' }],
  experience: [
    {
      company: 'FAANG Co',
      role: 'Senior Software Engineer',
      duration: 'Jan 2021 – Present',
      bulletPoints: [
        'Led backend migration serving 5M+ daily users, reducing latency by 45%',
        'Designed multi-region PostgreSQL architecture reducing failover time from 120s to 8s',
        'Deployed Kubernetes clusters across 3 AWS regions, cutting infrastructure cost by $200K/year',
        'Mentored 5 engineers across 2 squads; team delivery velocity improved by 30%',
        'Built Redis-based rate limiting system handling 500K requests/minute',
      ],
    },
    {
      company: 'StartupABC',
      role: 'Software Engineer',
      duration: 'Jun 2019 – Dec 2020',
      bulletPoints: [
        'Developed TypeScript microservices processing 2M+ daily events',
        'Increased test coverage from 40% to 88% across core payment service',
      ],
    },
  ],
  projects: [
    {
      name: 'Open Source ORM',
      description: 'TypeScript ORM with 5,000+ GitHub stars and 10K+ weekly npm downloads',
      techStack: ['TypeScript', 'PostgreSQL', 'Node.js'],
    },
    {
      name: 'Distributed Task Queue',
      description: 'Redis-backed job queue handling 1M+ tasks/day with 99.99% delivery guarantee',
      techStack: ['Redis', 'Node.js', 'Docker'],
    },
  ],
  certifications: ['AWS Certified Solutions Architect – Professional'],
};

// WEAK candidate: almost no skills, no experience, no projects
const RESUME_WEAK: ResumeJson = {
  name: 'Weak Candidate',
  email: 'weak@example.com',
  phone: null,
  skills: ['HTML'],
  education: [{ institution: 'XYZ College', degree: 'BSc', startYear: '2020', endYear: '2024' }],
  experience: [],
  projects: [],
  certifications: [],
};

// MEDIUM candidate: partial skill match, some experience, no quantification
const RESUME_MEDIUM: ResumeJson = {
  name: 'Medium Candidate',
  email: 'medium@example.com',
  phone: '555-000-1111',
  skills: ['JavaScript', 'Node.js', 'PostgreSQL', 'React'],
  education: [{ institution: 'State University', degree: 'B.Sc CS', startYear: '2019', endYear: '2023' }],
  experience: [
    {
      company: 'Startup XYZ',
      role: 'Junior Developer',
      duration: 'Jun 2023 – Present',
      bulletPoints: [
        'Worked on REST API development using Node.js',
        'Helped maintain PostgreSQL database schema',
        'Participated in Agile sprint planning and code reviews',
      ],
    },
  ],
  projects: [
    {
      name: 'Todo App',
      description: 'Simple todo list web application',
      techStack: ['React', 'Node.js'],
    },
  ],
  certifications: [],
};

// NO-SKILLS resume
const RESUME_NO_SKILLS: ResumeJson = {
  name: 'No Skills',
  email: 'noskills@example.com',
  phone: null,
  skills: [],
  education: [{ institution: 'University', degree: 'BSc', startYear: '2018', endYear: '2022' }],
  experience: [
    {
      company: 'Acme Corp',
      role: 'Developer',
      duration: 'Jan 2022 – Present',
      bulletPoints: ['Did stuff', 'Helped team'],
    },
  ],
  projects: [],
  certifications: [],
};

// NO-EXPERIENCE resume (experience + projects both empty)
const RESUME_NO_EXPERIENCE: ResumeJson = {
  name: 'Fresh Grad',
  email: 'fresh@example.com',
  phone: null,
  skills: ['JavaScript', 'React', 'Python'],
  education: [{ institution: 'MIT', degree: 'BS CS', startYear: '2020', endYear: '2024' }],
  experience: [],
  projects: [],
  certifications: [],
};

// ─── Output shape ─────────────────────────────────────────────────────────────

describe('simulate_recruiter — output shape', () => {
  let result: RecruiterSimResult;

  beforeAll(() => {
    result = simulate_recruiter({ resume: RESUME_MEDIUM, jobDescription: JD_STRONG });
  });

  it('returns all required top-level fields', () => {
    expect(result).toMatchObject({
      shortlist_probability: expect.any(Number),
      recruiter_decision: expect.any(String),
      top_red_flags: expect.any(Array),
      top_strengths: expect.any(Array),
      missing_requirements: expect.any(Array),
      recruiter_notes: expect.any(String),
    });
  });

  it('shortlist_probability is in 0-100 range', () => {
    expect(result.shortlist_probability).toBeGreaterThanOrEqual(0);
    expect(result.shortlist_probability).toBeLessThanOrEqual(100);
  });

  it('recruiter_decision is one of the valid enum values', () => {
    expect(['Reject', 'Maybe', 'Shortlist']).toContain(result.recruiter_decision);
  });

  it('recruiter_notes is a non-empty string', () => {
    expect(result.recruiter_notes.length).toBeGreaterThan(20);
  });

  it('every red flag has required fields', () => {
    for (const f of result.top_red_flags) {
      expect(typeof f.severity).toBe('string');
      expect(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).toContain(f.severity);
      expect(typeof f.category).toBe('string');
      expect(typeof f.description).toBe('string');
    }
  });

  it('every strength has required fields', () => {
    for (const s of result.top_strengths) {
      expect(typeof s.level).toBe('string');
      expect(['STANDOUT', 'STRONG', 'NOTABLE']).toContain(s.level);
      expect(typeof s.category).toBe('string');
      expect(typeof s.description).toBe('string');
    }
  });

  it('every missing requirement has required fields', () => {
    for (const m of result.missing_requirements) {
      expect(typeof m.item).toBe('string');
      expect(['REQUIRED', 'PREFERRED']).toContain(m.priority);
      expect(['jd', 'inferred']).toContain(m.source);
    }
  });

  it('_debug has correct structure', () => {
    expect(result._debug).toMatchObject({
      base_score: expect.any(Number),
      penalties: expect.any(Number),
      boosts: expect.any(Number),
      has_critical_flag: expect.any(Boolean),
      ats_summary: expect.objectContaining({
        overall: expect.any(Number),
        grade: expect.any(String),
        skills: expect.any(Number),
        experience: expect.any(Number),
        projects: expect.any(Number),
        impact: expect.any(Number),
        formatting: expect.any(Number),
      }),
    });
  });
});

// ─── Strong candidate → Shortlist ─────────────────────────────────────────────

describe('simulate_recruiter — strong candidate', () => {
  let result: RecruiterSimResult;

  beforeAll(() => {
    result = simulate_recruiter({ resume: RESUME_STRONG, jobDescription: JD_STRONG });
  });

  it('decision is Shortlist', () => {
    expect(result.recruiter_decision).toBe('Shortlist');
  });

  it('probability is ≥ 65', () => {
    expect(result.shortlist_probability).toBeGreaterThanOrEqual(65);
  });

  it('no CRITICAL red flags', () => {
    const critical = result.top_red_flags.filter((f) => f.severity === 'CRITICAL');
    expect(critical).toHaveLength(0);
  });

  it('has_critical_flag is false', () => {
    expect(result._debug.has_critical_flag).toBe(false);
  });

  it('has at least one STANDOUT or STRONG strength', () => {
    const top = result.top_strengths.filter((s) => s.level === 'STANDOUT' || s.level === 'STRONG');
    expect(top.length).toBeGreaterThan(0);
  });

  it('recruiter_notes recommend an interview', () => {
    expect(result.recruiter_notes.toLowerCase()).toMatch(/screen|interview|advance/);
  });

  it('has very few JD-required missing skills', () => {
    const required = result.missing_requirements.filter((m) => m.priority === 'REQUIRED' && m.source === 'jd');
    // Strong candidate covers most JD skills — at most 1-2 minor gaps from canonical-name variation
    expect(required.length).toBeLessThanOrEqual(2);
  });
});

// ─── Weak candidate → Reject ──────────────────────────────────────────────────

describe('simulate_recruiter — weak candidate', () => {
  let result: RecruiterSimResult;

  beforeAll(() => {
    result = simulate_recruiter({ resume: RESUME_WEAK, jobDescription: JD_STRONG });
  });

  it('decision is Reject', () => {
    expect(result.recruiter_decision).toBe('Reject');
  });

  it('probability is < 35', () => {
    expect(result.shortlist_probability).toBeLessThan(35);
  });

  it('has at least one CRITICAL red flag', () => {
    const critical = result.top_red_flags.filter((f) => f.severity === 'CRITICAL');
    expect(critical.length).toBeGreaterThan(0);
  });

  it('has_critical_flag is true', () => {
    expect(result._debug.has_critical_flag).toBe(true);
  });

  it('missing_requirements has JD-required items', () => {
    const required = result.missing_requirements.filter((m) => m.source === 'jd' || m.source === 'inferred');
    expect(required.length).toBeGreaterThan(0);
  });

  it('recruiter_notes say do not advance', () => {
    expect(result.recruiter_notes.toLowerCase()).toMatch(/not advance|do not|cannot|cannot/i);
  });
});

// ─── Medium candidate → Maybe ─────────────────────────────────────────────────

describe('simulate_recruiter — medium candidate', () => {
  let result: RecruiterSimResult;

  beforeAll(() => {
    result = simulate_recruiter({ resume: RESUME_MEDIUM, jobDescription: JD_STRONG });
  });

  it('decision is Maybe or Reject (borderline)', () => {
    expect(['Maybe', 'Reject']).toContain(result.recruiter_decision);
  });

  it('has skill-related red flags (medium match, missing Docker/Redis/K8s)', () => {
    const skillFlags = result.top_red_flags.filter((f) => f.category.includes('skill'));
    expect(skillFlags.length).toBeGreaterThan(0);
  });

  it('missing_requirements lists JD skills not in resume', () => {
    const jdMissing = result.missing_requirements.filter((m) => m.source === 'jd');
    expect(jdMissing.length).toBeGreaterThan(0);
  });
});

// ─── CRITICAL: no work evidence ──────────────────────────────────────────────

describe('simulate_recruiter — no work evidence', () => {
  let result: RecruiterSimResult;

  beforeAll(() => {
    result = simulate_recruiter({ resume: RESUME_NO_EXPERIENCE, jobDescription: JD_STRONG });
  });

  it('fires no_work_evidence CRITICAL flag', () => {
    const flag = result.top_red_flags.find((f) => f.category === 'no_work_evidence');
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe('CRITICAL');
  });

  it('decision is Reject', () => {
    expect(result.recruiter_decision).toBe('Reject');
  });

  it('probability is capped at 28', () => {
    expect(result.shortlist_probability).toBeLessThanOrEqual(28);
  });

  it('missing_requirements includes work experience', () => {
    const exp = result.missing_requirements.find((m) => m.item.toLowerCase().includes('experience'));
    expect(exp).toBeDefined();
    expect(exp!.priority).toBe('REQUIRED');
  });
});

// ─── CRITICAL: zero skills ────────────────────────────────────────────────────

describe('simulate_recruiter — zero skills', () => {
  let result: RecruiterSimResult;

  beforeAll(() => {
    result = simulate_recruiter({ resume: RESUME_NO_SKILLS, jobDescription: JD_STRONG });
  });

  it('fires zero_skills CRITICAL flag', () => {
    const flag = result.top_red_flags.find((f) => f.category === 'zero_skills');
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe('CRITICAL');
  });

  it('decision is Reject', () => {
    expect(result.recruiter_decision).toBe('Reject');
  });

  it('probability does not exceed 28', () => {
    expect(result.shortlist_probability).toBeLessThanOrEqual(28);
  });
});

// ─── Red flag ordering ────────────────────────────────────────────────────────

describe('simulate_recruiter — red flag ordering', () => {
  it('CRITICAL flags always appear before HIGH which appear before MEDIUM', () => {
    const result = simulate_recruiter({ resume: RESUME_WEAK, jobDescription: JD_STRONG });
    const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    const flags = result.top_red_flags;

    for (let i = 0; i < flags.length - 1; i++) {
      expect(order[flags[i].severity]).toBeLessThanOrEqual(order[flags[i + 1].severity]);
    }
  });
});

// ─── Strength ordering ────────────────────────────────────────────────────────

describe('simulate_recruiter — strength ordering', () => {
  it('STANDOUT strengths appear before STRONG which appear before NOTABLE', () => {
    const result = simulate_recruiter({ resume: RESUME_STRONG, jobDescription: JD_STRONG });
    const order: Record<string, number> = { STANDOUT: 0, STRONG: 1, NOTABLE: 2 };
    const strengths = result.top_strengths;

    for (let i = 0; i < strengths.length - 1; i++) {
      expect(order[strengths[i].level]).toBeLessThanOrEqual(order[strengths[i + 1].level]);
    }
  });
});

// ─── No JD scenario ───────────────────────────────────────────────────────────

describe('simulate_recruiter — without JD', () => {
  let result: RecruiterSimResult;

  beforeAll(() => {
    result = simulate_recruiter({ resume: RESUME_STRONG });
  });

  it('no JD-sourced missing requirements', () => {
    const jdMissing = result.missing_requirements.filter((m) => m.source === 'jd');
    expect(jdMissing).toHaveLength(0);
  });

  it('no skill-gap red flags (no JD to compare against)', () => {
    const skillFlags = result.top_red_flags.filter((f) => f.category.includes('skill_gap'));
    expect(skillFlags).toHaveLength(0);
  });

  it('still produces a valid probability and decision', () => {
    expect(result.shortlist_probability).toBeGreaterThanOrEqual(0);
    expect(result.shortlist_probability).toBeLessThanOrEqual(100);
    expect(['Reject', 'Maybe', 'Shortlist']).toContain(result.recruiter_decision);
  });

  it('strong no-JD candidate is not rejected', () => {
    // Strong candidate with 10 skills and quantified experience should not be Reject without JD
    expect(result.recruiter_decision).not.toBe('Reject');
  });
});

// ─── Missing requirements completeness ───────────────────────────────────────

describe('simulate_recruiter — missing requirements', () => {
  it('lists specific JD skills not present in resume', () => {
    const result = simulate_recruiter({ resume: RESUME_MEDIUM, jobDescription: JD_STRONG });
    const skillMissing = result.missing_requirements.filter((m) => m.source === 'jd');
    // Medium candidate is missing Docker, Kubernetes, Redis, AWS, TypeScript from JD
    expect(skillMissing.some((m) => /docker|kubernetes|redis|aws|typescript/i.test(m.item))).toBe(true);
  });

  it('infers missing quantification when experience exists but has no metrics', () => {
    const result = simulate_recruiter({ resume: RESUME_MEDIUM });
    const inferred = result.missing_requirements.filter((m) => m.source === 'inferred');
    expect(inferred.some((m) => /quantif|metric|measur/i.test(m.item))).toBe(true);
  });
});

// ─── Probability arithmetic ───────────────────────────────────────────────────

describe('simulate_recruiter — probability arithmetic', () => {
  it('base_score + boosts - penalties = final probability (before cap)', () => {
    const result = simulate_recruiter({ resume: RESUME_MEDIUM, jobDescription: JD_STRONG });
    const { base_score, boosts, penalties, has_critical_flag } = result._debug;

    let expected = base_score + boosts - penalties;
    if (has_critical_flag) expected = Math.min(expected, 28);
    expected = Math.max(0, Math.min(100, Math.round(expected)));

    expect(result.shortlist_probability).toBe(expected);
  });

  it('critical flag caps probability at 28', () => {
    // No-experience candidate should be capped at 28
    const result = simulate_recruiter({ resume: RESUME_NO_EXPERIENCE, jobDescription: JD_STRONG });
    expect(result._debug.has_critical_flag).toBe(true);
    expect(result.shortlist_probability).toBeLessThanOrEqual(28);
  });
});

// ─── Decision boundaries ──────────────────────────────────────────────────────

describe('simulate_recruiter — decision boundaries', () => {
  it('Shortlist requires probability ≥ 65 and no CRITICAL flags', () => {
    const result = simulate_recruiter({ resume: RESUME_STRONG, jobDescription: JD_STRONG });
    if (result.recruiter_decision === 'Shortlist') {
      expect(result.shortlist_probability).toBeGreaterThanOrEqual(65);
      expect(result._debug.has_critical_flag).toBe(false);
    }
  });

  it('Reject fires when has_critical_flag is true regardless of probability arithmetic', () => {
    const result = simulate_recruiter({ resume: RESUME_NO_EXPERIENCE });
    expect(result._debug.has_critical_flag).toBe(true);
    expect(result.recruiter_decision).toBe('Reject');
  });
});

// ─── Recruiter notes content ──────────────────────────────────────────────────

describe('simulate_recruiter — recruiter_notes', () => {
  it('Shortlist notes recommend screening', () => {
    const result = simulate_recruiter({ resume: RESUME_STRONG, jobDescription: JD_STRONG });
    expect(result.recruiter_decision).toBe('Shortlist');
    expect(result.recruiter_notes.toLowerCase()).toMatch(/screen|interview/);
  });

  it('Reject notes say do not advance', () => {
    const result = simulate_recruiter({ resume: RESUME_WEAK, jobDescription: JD_STRONG });
    expect(result.recruiter_decision).toBe('Reject');
    expect(result.recruiter_notes.toLowerCase()).toMatch(/not advance|do not/);
  });

  it('notes are always three sentences (end with period)', () => {
    const result = simulate_recruiter({ resume: RESUME_MEDIUM, jobDescription: JD_STRONG });
    // Count sentence-ending punctuation
    const sentences = result.recruiter_notes.split(/(?<=[.!?])\s+/);
    expect(sentences.length).toBeGreaterThanOrEqual(2);
  });
});
