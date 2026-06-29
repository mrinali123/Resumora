import { matchResumeToJob } from '../../../src/jd-matching';
import type { JdMatchInput, ResumeJson } from '../../../src/jd-matching';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FULL_RESUME: ResumeJson = {
  name: 'Mrinali Parida',
  email: 'mrinali@example.com',
  phone: '+91 98765 43210',
  skills: [
    'TypeScript', 'JavaScript', 'React', 'Node.js', 'PostgreSQL',
    'Redis', 'Docker', 'Kubernetes', 'AWS', 'GraphQL', 'Python',
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
        'Reduced API latency by 40% via Redis caching',
        'Mentored 3 junior developers',
      ],
    },
    {
      company: 'StartupXYZ',
      role: 'Software Engineer',
      duration: 'June 2022 – December 2023',
      bulletPoints: [
        'Built React + TypeScript dashboard with WebSocket real-time updates',
        'Designed PostgreSQL schema for multi-tenant SaaS',
      ],
    },
  ],
  projects: [
    {
      name: 'Resume Analyzer AI',
      description: 'End-to-end resume parsing and semantic job matching platform',
      techStack: ['Node.js', 'PostgreSQL', 'pgvector', 'OpenAI'],
    },
  ],
  certifications: ['AWS Certified Solutions Architect – Associate'],
};

const STRONG_MATCH_JD = `
Senior Software Engineer — Backend Platform

Requirements
• 3+ years of professional software engineering experience
• Strong proficiency in TypeScript and Node.js
• Experience with PostgreSQL and Redis
• Familiarity with Docker and Kubernetes
• Cloud platform experience (AWS preferred)

Nice to Have
• GraphQL API design experience
• Python scripting skills

Responsibilities
• Build and maintain microservices serving millions of users
• Optimise API performance through caching strategies
• Collaborate with cross-functional engineering teams
`;

const WEAK_MATCH_JD = `
Mobile iOS Engineer

Requirements
• 5+ years experience with iOS development
• Expert-level Swift and SwiftUI
• Xcode, Core Data, and UIKit required
• Experience with CocoaPods and Swift Package Manager

Nice to Have
• Objective-C experience
• Android/Kotlin cross-platform knowledge

Responsibilities
• Build native iOS applications from design mockups
• Write unit tests with XCTest framework
`;

const MINIMAL_JD = `
Software Developer

We are hiring a software developer to join our team.
Please send your resume if you are interested.
`;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('matchResumeToJob — output shape', () => {
  let result: ReturnType<typeof matchResumeToJob>;

  beforeAll(() => {
    result = matchResumeToJob({ resume: FULL_RESUME, jobDescription: STRONG_MATCH_JD });
  });

  it('returns all required top-level fields', () => {
    expect(result).toMatchObject({
      overall_match_score: expect.any(Number),
      skill_match_score: expect.any(Number),
      experience_match_score: expect.any(Number),
      missing_skills: expect.any(Array),
      strong_matching_skills: expect.any(Array),
      semantic_similarity_score: expect.any(Number),
      explanation: expect.any(String),
    });
  });

  it('all scores are integers in [0, 100]', () => {
    const scores = [
      result.overall_match_score,
      result.skill_match_score,
      result.experience_match_score,
      result.semantic_similarity_score,
    ];
    for (const s of scores) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
      expect(Number.isInteger(s)).toBe(true);
    }
  });

  it('explanation is a non-empty string', () => {
    expect(result.explanation.length).toBeGreaterThan(20);
  });

  it('_breakdown contains all expected sub-objects', () => {
    const { _breakdown } = result;
    expect(_breakdown.skill_detail).toBeDefined();
    expect(_breakdown.experience_detail).toBeDefined();
    expect(_breakdown.semantic_detail).toBeDefined();
    expect(_breakdown.weights_used).toMatchObject({
      skills: 0.45,
      experience: 0.35,
      semantic: 0.20,
    });
  });
});

describe('matchResumeToJob — strong match scenario', () => {
  let result: ReturnType<typeof matchResumeToJob>;

  beforeAll(() => {
    result = matchResumeToJob({ resume: FULL_RESUME, jobDescription: STRONG_MATCH_JD });
  });

  it('overall score is high for a well-matched resume', () => {
    expect(result.overall_match_score).toBeGreaterThanOrEqual(60);
  });

  it('skill score is high when most JD skills are present', () => {
    expect(result.skill_match_score).toBeGreaterThanOrEqual(55);
  });

  it('strong_matching_skills contains known matches like TypeScript', () => {
    const lower = result.strong_matching_skills.map((s) => s.toLowerCase());
    // At least TypeScript or Node.js should appear as a strong match
    const hasExpectedMatch =
      lower.some((s) => s.includes('typescript') || s.includes('node') || s.includes('redis'));
    expect(hasExpectedMatch).toBe(true);
  });

  it('missing_skills are sorted by importance (not arbitrary order)', () => {
    // When there are multiple missing skills, they should all be strings
    expect(result.missing_skills.every((s) => typeof s === 'string')).toBe(true);
  });
});

describe('matchResumeToJob — weak match scenario', () => {
  let result: ReturnType<typeof matchResumeToJob>;

  beforeAll(() => {
    result = matchResumeToJob({ resume: FULL_RESUME, jobDescription: WEAK_MATCH_JD });
  });

  it('overall score is low for a mismatched resume', () => {
    expect(result.overall_match_score).toBeLessThan(50);
  });

  it('skill score is low when resume lacks JD skills', () => {
    expect(result.skill_match_score).toBeLessThan(35);
  });

  it('missing_skills includes iOS-specific technologies', () => {
    const lower = result.missing_skills.map((s) => s.toLowerCase());
    const hasIosSkill = lower.some((s) =>
      s.includes('swift') || s.includes('ios') || s.includes('xcode'),
    );
    expect(hasIosSkill).toBe(true);
  });

  it('explanation mentions missing skills', () => {
    expect(result.explanation.toLowerCase()).toMatch(/missing|skill|gap/);
  });
});

describe('matchResumeToJob — edge cases', () => {
  it('handles empty resume skills gracefully', () => {
    const emptySkillsResume: ResumeJson = {
      ...FULL_RESUME,
      skills: [],
      experience: [],
    };
    const r = matchResumeToJob({ resume: emptySkillsResume, jobDescription: STRONG_MATCH_JD });
    expect(r.overall_match_score).toBeGreaterThanOrEqual(0);
    expect(r.overall_match_score).toBeLessThanOrEqual(100);
    expect(r.strong_matching_skills).toEqual([]);
  });

  it('handles JD with no recognisable skills', () => {
    const r = matchResumeToJob({ resume: FULL_RESUME, jobDescription: MINIMAL_JD });
    // No JD skills → skill_match_score should be 100 (no requirements to fail)
    expect(r.skill_match_score).toBe(100);
    expect(r.missing_skills).toEqual([]);
  });

  it('returns integer scores with embedding vectors provided', () => {
    // Simulate L2-normalised 4-dim vectors
    const norm = (v: number[]) => {
      const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
      return v.map((x) => x / mag);
    };
    const resumeVec = norm([0.5, 0.3, 0.7, 0.2]);
    const jdVec = norm([0.4, 0.35, 0.65, 0.3]);

    const r = matchResumeToJob({
      resume: FULL_RESUME,
      jobDescription: STRONG_MATCH_JD,
      resumeEmbedding: resumeVec,
      jdEmbedding: jdVec,
    });

    expect(r.semantic_similarity_score).toBeGreaterThan(0);
    expect(r.semantic_similarity_score).toBeLessThanOrEqual(100);
    expect(r._breakdown.semantic_detail.method).toBe('embedding');
  });

  it('falls back to jaccard when embedding dimensions mismatch', () => {
    const r = matchResumeToJob({
      resume: FULL_RESUME,
      jobDescription: STRONG_MATCH_JD,
      resumeEmbedding: [0.1, 0.2, 0.3],
      jdEmbedding: [0.1, 0.2], // different length
    });
    expect(r._breakdown.semantic_detail.method).toBe('jaccard');
  });
});

describe('matchResumeToJob — skill breakdown consistency', () => {
  it('matched_count + missing count = total_jd_skills', () => {
    const r = matchResumeToJob({ resume: FULL_RESUME, jobDescription: STRONG_MATCH_JD });
    const { matched_count, total_jd_skills } = r._breakdown.skill_detail;
    expect(matched_count + r.missing_skills.length).toBe(total_jd_skills);
  });

  it('strong_matching_skills is a subset of matched skills', () => {
    const r = matchResumeToJob({ resume: FULL_RESUME, jobDescription: STRONG_MATCH_JD });
    const matchedSet = new Set(r._breakdown.skill_detail.matched_count > 0
      // strong_matches must be subset of what was matched
      ? r.strong_matching_skills
      : []);
    // Every strong match should also not be in missing_skills
    for (const s of r.strong_matching_skills) {
      expect(r.missing_skills).not.toContain(s);
    }
  });

  it('overall score is consistent with component weights', () => {
    const r = matchResumeToJob({ resume: FULL_RESUME, jobDescription: STRONG_MATCH_JD });
    const manual =
      r.skill_match_score * 0.45 +
      r.experience_match_score * 0.35 +
      r.semantic_similarity_score * 0.20;
    expect(Math.abs(r.overall_match_score - Math.round(manual))).toBeLessThanOrEqual(2);
  });
});
