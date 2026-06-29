// Unit tests for ScoringService's pure computation methods.
// DB-touching methods (computeExperienceScoreViaEmbeddings, etc.) are NOT tested
// here — they belong in integration tests with a real test database.

import { ScoringService } from '../../src/analysis/scoring.service';
import { DEFAULT_SCORING_WEIGHTS } from '../../src/analysis/skills.constants';

// Mock the database and embedding service to isolate pure logic
jest.mock('../../src/config/database', () => ({
  prisma: {
    $queryRawUnsafe: jest.fn(),
    resumeChunk: { findFirst: jest.fn() },
    jobChunk: { findFirst: jest.fn() },
  },
}));

const service = new ScoringService();

describe('ScoringService.computeSkillScore', () => {
  it('returns 100 when no required skills', () => {
    expect(service.computeSkillScore([], [], [])).toBe(100);
  });

  it('gives full credit for exact matches', () => {
    const score = service.computeSkillScore(['TypeScript', 'React'], [], ['TypeScript', 'React']);
    expect(score).toBe(100);
  });

  it('gives 0.75 credit for semantic-only matches', () => {
    // 0 exact, 2 semantic, 2 required → (0 + 2*0.75) / 2 * 100 = 75
    const score = service.computeSkillScore([], ['TypeScript', 'React'], ['TypeScript', 'React']);
    expect(score).toBeCloseTo(75);
  });

  it('handles partial coverage', () => {
    // 1 exact, 0 semantic, 2 required → (1 + 0) / 2 * 100 = 50
    const score = service.computeSkillScore(['TypeScript'], [], ['TypeScript', 'React']);
    expect(score).toBeCloseTo(50);
  });
});

describe('ScoringService.computeEducationScore', () => {
  it('returns 100 when JD has no education requirement', () => {
    const score = service.computeEducationScore([], 'Looking for a motivated developer');
    expect(score).toBe(100);
  });

  it('returns 100 when candidate meets requirement exactly', () => {
    const score = service.computeEducationScore(
      [{ institution: 'MIT', degree: "Bachelor's", field: 'CS' }],
      "Bachelor's degree required",
    );
    expect(score).toBe(100);
  });

  it('penalises when candidate is below requirement', () => {
    const score = service.computeEducationScore(
      [{ institution: 'MIT', degree: "Bachelor's", field: 'CS' }],
      "Master's degree required",
    );
    expect(score).toBeLessThan(100);
    expect(score).toBeGreaterThan(0);
  });

  it('returns 0 or low score when no education and PhD required', () => {
    const score = service.computeEducationScore([], 'PhD required');
    expect(score).toBeLessThanOrEqual(30);
  });
});

describe('ScoringService.computeOverallScore', () => {
  it('uses DEFAULT_SCORING_WEIGHTS correctly', () => {
    const allHundred = {
      skill: 100,
      experience: 100,
      education: 100,
      keyword: 100,
      semantic: 100,
    };
    expect(service.computeOverallScore(allHundred)).toBe(100);
  });

  it('weights sum to 1.0', () => {
    const sum = Object.values(DEFAULT_SCORING_WEIGHTS).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it('correctly applies weights for zero-skill score', () => {
    const scores = {
      skill: 0,
      experience: 100,
      education: 100,
      keyword: 100,
      semantic: 100,
    };
    const w = DEFAULT_SCORING_WEIGHTS;
    const expected =
      0 * w.skills +
      100 * w.experience +
      100 * w.education +
      100 * w.keyword +
      100 * w.semantic;
    expect(service.computeOverallScore(scores)).toBeCloseTo(expected, 1);
  });

  it('clamps output to [0, 100]', () => {
    const scores = { skill: 120, experience: 120, education: 120, keyword: 120, semantic: 120 };
    expect(service.computeOverallScore(scores)).toBe(100);
  });
});

describe('ScoringService.computeKeywordCoverage', () => {
  it('returns full coverage when job has no tech keywords', () => {
    const coverage = service.computeKeywordCoverage(
      'I am a passionate professional.',
      'Join our team of dynamic individuals.',
    );
    expect(coverage.coverageRate).toBe(1);
  });

  it('detects keywords present in resume', () => {
    const coverage = service.computeKeywordCoverage(
      'Proficient in TypeScript and React',
      'Required: TypeScript, React, PostgreSQL',
    );
    expect(coverage.covered).toContain('TypeScript');
    expect(coverage.covered).toContain('React');
  });

  it('detects missing keywords', () => {
    const coverage = service.computeKeywordCoverage(
      'Proficient in TypeScript',
      'Required: TypeScript, React, PostgreSQL',
    );
    expect(coverage.missing).toContain('PostgreSQL');
  });
});
