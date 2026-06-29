// Unit tests for pure utility functions in skills.utils.ts.
// No mocking needed — pure functions with deterministic outputs.

import {
  normaliseSkill,
  dotProduct,
  parseVectorString,
  clampScore,
  weightedTopKMean,
  detectEducationLevel,
  extractSkillsFromText,
} from '../../src/analysis/skills.utils';

describe('normaliseSkill', () => {
  it('lowercases and strips punctuation', () => {
    expect(normaliseSkill('Node.js')).toBe('nodejs');
    expect(normaliseSkill('C++')).toBe('c++');
    expect(normaliseSkill('React-Native')).toBe('reactnative');
  });

  it('strips whitespace', () => {
    expect(normaliseSkill('  TypeScript  ')).toBe('typescript');
    expect(normaliseSkill('Machine Learning')).toBe('machinelearning');
  });
});

describe('dotProduct', () => {
  it('computes correct dot product for unit vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(dotProduct(a, b)).toBe(0);
  });

  it('returns 1.0 for identical unit vectors', () => {
    const v = [1 / Math.sqrt(2), 1 / Math.sqrt(2), 0];
    expect(dotProduct(v, v)).toBeCloseTo(1.0, 5);
  });

  it('handles mismatched lengths by using min length', () => {
    const a = [1, 0];
    const b = [1, 0, 0];
    expect(dotProduct(a, b)).toBe(1);
  });
});

describe('parseVectorString', () => {
  it('parses a pgvector string into a number array', () => {
    const result = parseVectorString('[0.1,0.2,0.3]');
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  it('handles extra whitespace', () => {
    const result = parseVectorString('[ 0.5 , 0.5 ]');
    expect(result).toHaveLength(2);
    expect(result[0]).toBeCloseTo(0.5);
  });

  it('returns empty array for empty brackets', () => {
    expect(parseVectorString('[]')).toEqual([]);
  });
});

describe('clampScore', () => {
  it('clamps values below 0', () => {
    expect(clampScore(-10)).toBe(0);
  });

  it('clamps values above 100', () => {
    expect(clampScore(150)).toBe(100);
  });

  it('passes through values in range', () => {
    expect(clampScore(75.555)).toBe(75.56);
  });

  it('returns exactly 0 and 100 at boundaries', () => {
    expect(clampScore(0)).toBe(0);
    expect(clampScore(100)).toBe(100);
  });
});

describe('weightedTopKMean', () => {
  it('returns 0 for empty array', () => {
    expect(weightedTopKMean([], 3)).toBe(0);
  });

  it('returns single value for single-element array', () => {
    expect(weightedTopKMean([0.8], 3)).toBeCloseTo(0.8);
  });

  it('weights first element most heavily', () => {
    const scores = [1.0, 0.0, 0.0];
    const result = weightedTopKMean(scores, 3);
    // Weights: 1, 0.5, 0.33... Normalised so sum=1
    // Best score 1.0 should dominate
    expect(result).toBeGreaterThan(0.5);
  });

  it('sorts by descending value before applying weights', () => {
    const unordered = [0.3, 1.0, 0.7];
    const ordered = [1.0, 0.7, 0.3];
    // Same underlying scores, different order — result should be the same
    expect(weightedTopKMean(unordered, 3)).toBeCloseTo(weightedTopKMean(ordered, 3), 5);
  });
});

describe('detectEducationLevel', () => {
  it('detects PhD', () => {
    expect(detectEducationLevel('Ph.D. in Computer Science')).toBe('phd');
    expect(detectEducationLevel('Doctor of Philosophy')).toBe('phd');
  });

  it('detects masters', () => {
    expect(detectEducationLevel("Master's degree in Data Science")).toBe('masters');
    expect(detectEducationLevel('M.S. Computer Science')).toBe('masters');
  });

  it('detects bachelors', () => {
    expect(detectEducationLevel("Bachelor's in Software Engineering")).toBe('bachelors');
    expect(detectEducationLevel('B.S. Computer Science')).toBe('bachelors');
  });

  it('returns none for no education mentioned', () => {
    expect(detectEducationLevel('5 years of experience')).toBe('none');
    expect(detectEducationLevel('')).toBe('none');
  });
});

describe('extractSkillsFromText', () => {
  it('extracts known tech skills from text', () => {
    const text = 'Experienced with TypeScript, React, and PostgreSQL';
    const skills = extractSkillsFromText(text);
    expect(skills).toContain('TypeScript');
    expect(skills).toContain('React');
    expect(skills).toContain('PostgreSQL');
  });

  it('does not double-extract the same skill', () => {
    const text = 'TypeScript TypeScript TypeScript';
    const skills = extractSkillsFromText(text);
    const tsCount = skills.filter((s) => s === 'TypeScript').length;
    expect(tsCount).toBe(1);
  });

  it('returns empty array for text with no known skills', () => {
    const text = 'I enjoy hiking and cooking on weekends.';
    const skills = extractSkillsFromText(text);
    expect(skills).toHaveLength(0);
  });
});
