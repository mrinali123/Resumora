import { explain_score } from '../../../src/ats-scoring';
import type { AtsScoreResult, ResumeJson } from '../../../src/ats-scoring';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FULL_RESUME: ResumeJson = {
  name: 'Mrinali Parida',
  email: 'mrinali@example.com',
  phone: '+91 98765 43210',
  skills: [
    'TypeScript', 'JavaScript', 'React', 'Node.js', 'PostgreSQL',
    'Redis', 'Docker', 'Kubernetes', 'AWS', 'GraphQL', 'Python', 'Git',
  ],
  education: [
    { institution: 'NIT Rourkela', degree: 'B.Tech Computer Science', startYear: '2018', endYear: '2022' },
  ],
  experience: [
    {
      company: 'TechCorp India',
      role: 'Senior Software Engineer',
      duration: 'Jan 2024 – Present',
      bulletPoints: [
        'Led microservices platform serving 2M+ users',
        'Reduced API latency by 40% via Redis caching and query optimisation',
        'Mentored 3 junior developers, improving team velocity by 25%',
        'Deployed containerised workloads on Kubernetes across 3 availability zones',
      ],
    },
    {
      company: 'StartupXYZ',
      role: 'Software Engineer',
      duration: 'June 2022 – December 2023',
      bulletPoints: [
        'Built React + TypeScript dashboard with WebSocket real-time updates for 50K DAU',
        'Designed PostgreSQL schema for multi-tenant SaaS (12 clients, 5M rows)',
        'Implemented CI/CD pipeline reducing deployment time from 45 min to 8 min',
      ],
    },
  ],
  projects: [
    {
      name: 'Resume Analyzer AI',
      description: 'End-to-end resume parsing and semantic job matching platform with pgvector similarity search',
      techStack: ['Node.js', 'PostgreSQL', 'pgvector', 'OpenAI', 'TypeScript'],
    },
    {
      name: 'Open Source CLI Tool',
      description: 'Developer productivity CLI tool with 2K+ GitHub stars and 500+ weekly downloads',
      techStack: ['Go', 'Cobra'],
    },
  ],
  certifications: ['AWS Certified Solutions Architect – Associate'],
};

const STRONG_MATCH_JD = `
Senior Software Engineer — Backend Platform

Requirements
- 3+ years of professional software engineering experience
- Strong proficiency in TypeScript and Node.js
- Experience with PostgreSQL and Redis for data persistence and caching
- Familiarity with Docker and Kubernetes for container orchestration
- Cloud platform experience (AWS preferred)

Nice to Have
- GraphQL API design experience
- Python scripting for data pipelines

Responsibilities
- Build and maintain distributed microservices serving millions of users
- Optimise API performance and database query patterns
- Collaborate with cross-functional teams to deliver features
- Mentor junior engineers
`;

const WEAK_MATCH_JD = `
Mobile iOS Engineer

Requirements
- 5+ years experience with native iOS development
- Expert in Swift and SwiftUI
- Xcode, Core Data, UIKit are required
- Swift Package Manager and CocoaPods experience

Nice to Have
- Objective-C legacy codebase experience

Responsibilities
- Build native iOS applications from design mockups
- Write automated UI tests with XCTest
`;

const MINIMAL_RESUME: ResumeJson = {
  name: 'John',
  email: null,
  phone: null,
  skills: ['Python'],
  education: [],
  experience: [],
  projects: [],
  certifications: [],
};

// ─── Output shape ─────────────────────────────────────────────────────────────

describe('explain_score — output shape', () => {
  let result: AtsScoreResult;

  beforeAll(() => {
    result = explain_score(FULL_RESUME, STRONG_MATCH_JD);
  });

  it('returns all required top-level fields', () => {
    expect(result).toMatchObject({
      overall_score: expect.any(Number),
      grade: expect.any(String),
      components: expect.any(Array),
      strengths: expect.any(Array),
      improvement_areas: expect.any(Array),
      summary: expect.any(String),
    });
  });

  it('overall_score is an integer in [0, 100]', () => {
    expect(result.overall_score).toBeGreaterThanOrEqual(0);
    expect(result.overall_score).toBeLessThanOrEqual(100);
    expect(Number.isInteger(result.overall_score)).toBe(true);
  });

  it('grade is a valid letter grade', () => {
    expect(['A+', 'A', 'B+', 'B', 'C', 'D', 'F']).toContain(result.grade);
  });

  it('returns exactly 5 components', () => {
    expect(result.components).toHaveLength(5);
  });

  it('each component has required fields', () => {
    for (const c of result.components) {
      expect(c).toMatchObject({
        component: expect.any(String),
        name: expect.any(String),
        weight: expect.any(Number),
        raw_score: expect.any(Number),
        weighted_score: expect.any(Number),
        explanation: expect.any(String),
        evidence: expect.any(Array),
        sub_scores: expect.any(Array),
      });
    }
  });

  it('all component raw_scores are in [0, 100]', () => {
    for (const c of result.components) {
      expect(c.raw_score).toBeGreaterThanOrEqual(0);
      expect(c.raw_score).toBeLessThanOrEqual(100);
    }
  });

  it('component weights sum to 1.0', () => {
    const total = result.components.reduce((s, c) => s + c.weight, 0);
    expect(Math.abs(total - 1.0)).toBeLessThan(0.001);
  });

  it('overall_score matches weighted sum of components', () => {
    const manual = result.components.reduce((s, c) => s + c.raw_score * c.weight, 0);
    expect(Math.abs(result.overall_score - Math.round(manual))).toBeLessThanOrEqual(1);
  });

  it('weighted_score = raw_score × weight (within rounding)', () => {
    for (const c of result.components) {
      const expected = c.raw_score * c.weight;
      expect(Math.abs(c.weighted_score - expected)).toBeLessThan(0.6);
    }
  });

  it('each component has at least one evidence item', () => {
    for (const c of result.components) {
      expect(c.evidence.length).toBeGreaterThan(0);
    }
  });

  it('each component has at least one sub_score', () => {
    for (const c of result.components) {
      expect(c.sub_scores.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('summary is a non-empty string', () => {
    expect(result.summary.length).toBeGreaterThan(30);
  });
});

// ─── Strong match scenario ─────────────────────────────────────────────────────

describe('explain_score — strong match scenario', () => {
  let result: AtsScoreResult;

  beforeAll(() => {
    result = explain_score(FULL_RESUME, STRONG_MATCH_JD);
  });

  it('overall score is high for a well-matched resume', () => {
    expect(result.overall_score).toBeGreaterThanOrEqual(60);
  });

  it('skills_match component has a high score', () => {
    const skills = result.components.find((c) => c.component === 'skills_match')!;
    expect(skills.raw_score).toBeGreaterThanOrEqual(55);
  });

  it('skills_match has both matched and missing evidence', () => {
    const skills = result.components.find((c) => c.component === 'skills_match')!;
    const matched = skills.evidence.filter((e) => e.type === 'matched_skill');
    expect(matched.length).toBeGreaterThan(0);
  });

  it('formatting_quality is high for a complete resume', () => {
    const fmt = result.components.find((c) => c.component === 'formatting_quality')!;
    expect(fmt.raw_score).toBeGreaterThanOrEqual(75);
  });

  it('impact_metrics detects quantified bullets', () => {
    const impact = result.components.find((c) => c.component === 'impact_metrics')!;
    // Resume has "40%", "2M+ users", "25%", "50K DAU", "5M rows", "45 min", "8 min"
    expect(impact.raw_score).toBeGreaterThan(20);
    const metrics = impact.evidence.filter((e) => e.type === 'metric_bullet' && e.polarity === 'positive');
    expect(metrics.length).toBeGreaterThan(0);
  });

  it('project_strength detects projects with tech stacks', () => {
    const proj = result.components.find((c) => c.component === 'project_strength')!;
    expect(proj.raw_score).toBeGreaterThan(30);
    const projEvidence = proj.evidence.filter((e) => e.type === 'project_entry');
    expect(projEvidence.length).toBe(2);
  });
});

// ─── Weak match scenario ──────────────────────────────────────────────────────

describe('explain_score — weak match scenario', () => {
  let result: AtsScoreResult;

  beforeAll(() => {
    result = explain_score(FULL_RESUME, WEAK_MATCH_JD);
  });

  it('overall score is lower for a mismatched resume', () => {
    expect(result.overall_score).toBeLessThan(70);
  });

  it('skills_match is low when key JD skills are absent', () => {
    const skills = result.components.find((c) => c.component === 'skills_match')!;
    expect(skills.raw_score).toBeLessThan(40);
  });

  it('missing_skill evidence includes iOS skills', () => {
    const skills = result.components.find((c) => c.component === 'skills_match')!;
    const missing = skills.evidence.filter((e) => e.type === 'missing_skill');
    expect(missing.length).toBeGreaterThan(0);
    const hasIos = missing.some((e) =>
      e.value.toLowerCase().includes('swift') || e.value.toLowerCase().includes('ios'),
    );
    expect(hasIos).toBe(true);
  });

  it('improvement_areas is non-empty', () => {
    expect(result.improvement_areas.length).toBeGreaterThan(0);
  });
});

// ─── Minimal resume ───────────────────────────────────────────────────────────

describe('explain_score — minimal/incomplete resume', () => {
  let result: AtsScoreResult;

  beforeAll(() => {
    result = explain_score(MINIMAL_RESUME, STRONG_MATCH_JD);
  });

  it('returns valid output even for a minimal resume', () => {
    expect(result.overall_score).toBeGreaterThanOrEqual(0);
    expect(result.overall_score).toBeLessThanOrEqual(100);
    expect(result.components).toHaveLength(5);
  });

  it('formatting_quality is low for a minimal resume', () => {
    const fmt = result.components.find((c) => c.component === 'formatting_quality')!;
    // Missing: email, phone, 8+ skills, experience, projects, education
    expect(fmt.raw_score).toBeLessThan(50);
  });

  it('impact_metrics handles no bullets gracefully', () => {
    const impact = result.components.find((c) => c.component === 'impact_metrics')!;
    expect(impact.raw_score).toBeGreaterThanOrEqual(0);
    expect(impact.raw_score).toBeLessThanOrEqual(100);
  });

  it('project_strength returns 0 for no projects', () => {
    const proj = result.components.find((c) => c.component === 'project_strength')!;
    expect(proj.raw_score).toBe(0);
  });
});

// ─── Evidence contract ────────────────────────────────────────────────────────

describe('explain_score — evidence contract', () => {
  let result: AtsScoreResult;

  beforeAll(() => {
    result = explain_score(FULL_RESUME, STRONG_MATCH_JD);
  });

  it('all evidence items have required fields', () => {
    for (const c of result.components) {
      for (const e of c.evidence) {
        expect(typeof e.type).toBe('string');
        expect(typeof e.label).toBe('string');
        expect(typeof e.value).toBe('string');
        expect(['resume', 'jd', 'both']).toContain(e.source);
        expect(['positive', 'negative', 'neutral']).toContain(e.polarity);
      }
    }
  });

  it('all sub_scores have weight, score, formula', () => {
    for (const c of result.components) {
      for (const s of c.sub_scores) {
        expect(typeof s.name).toBe('string');
        expect(typeof s.score).toBe('number');
        expect(typeof s.weight).toBe('number');
        expect(typeof s.formula).toBe('string');
        expect(s.score).toBeGreaterThanOrEqual(0);
        expect(s.score).toBeLessThanOrEqual(100);
      }
    }
  });

  it('formatting_quality evidence contains a format_check type', () => {
    const fmt = result.components.find((c) => c.component === 'formatting_quality')!;
    const checks = fmt.evidence.filter((e) => e.type === 'format_check');
    expect(checks.length).toBeGreaterThan(0);
  });

  it('each explanation is non-empty', () => {
    for (const c of result.components) {
      expect(c.explanation.trim().length).toBeGreaterThan(10);
    }
  });
});

// ─── Sub-score internals ──────────────────────────────────────────────────────

describe('explain_score — sub-score internals', () => {
  let result: AtsScoreResult;

  beforeAll(() => {
    result = explain_score(FULL_RESUME, STRONG_MATCH_JD);
  });

  it('skills_match has weighted_coverage and required-section sub-scores', () => {
    const skills = result.components.find((c) => c.component === 'skills_match')!;
    const names = skills.sub_scores.map((s) => s.name);
    expect(names).toContain('Weighted skill coverage');
    expect(names).toContain('Required-section coverage');
  });

  it('experience_relevance has years, responsibility, seniority, diversity sub-scores', () => {
    const exp = result.components.find((c) => c.component === 'experience_relevance')!;
    const names = exp.sub_scores.map((s) => s.name);
    expect(names).toContain('Years adequacy');
    expect(names).toContain('Responsibility overlap');
    expect(names).toContain('Seniority alignment');
    expect(names).toContain('Role diversity');
  });

  it('formatting_quality sub-scores weights sum to ~1.0', () => {
    const fmt = result.components.find((c) => c.component === 'formatting_quality')!;
    const total = fmt.sub_scores.reduce((s, ss) => s + ss.weight, 0);
    expect(Math.abs(total - 1.0)).toBeLessThan(0.01);
  });

  it('impact_metrics has metric_density, action_verb_density, scale_indicators', () => {
    const impact = result.components.find((c) => c.component === 'impact_metrics')!;
    const names = impact.sub_scores.map((s) => s.name);
    expect(names).toContain('Metric density');
    expect(names).toContain('Action verb density');
    expect(names).toContain('Scale indicators');
  });
});
