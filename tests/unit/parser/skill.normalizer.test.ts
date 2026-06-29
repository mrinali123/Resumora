import { normaliseSkill, normaliseAndDedup } from '../../../src/parser/normalizers/skill.normalizer';

describe('normaliseSkill', () => {
  it.each([
    ['js', 'JavaScript'],
    ['JS', 'JavaScript'],
    ['reactjs', 'React'],
    ['React.js', 'React'],
    ['nodejs', 'Node.js'],
    ['node.js', 'Node.js'],
    ['k8s', 'Kubernetes'],
    ['K8S', 'Kubernetes'],
    ['postgres', 'PostgreSQL'],
    ['psql', 'PostgreSQL'],
    ['mongo', 'MongoDB'],
    ['golang', 'Go'],
    ['ts', 'TypeScript'],
    ['py', 'Python'],
    ['python3', 'Python'],
    ['tensorflow', 'TensorFlow'],
    ['pytorch', 'PyTorch'],
    ['sklearn', 'scikit-learn'],
    ['tailwindcss', 'Tailwind'],
    ['nestjs', 'NestJS'],
    ['grpc', 'gRPC'],
    ['ci/cd', 'CI/CD'],
    ['github actions', 'GitHub Actions'],
  ])('normalises %s → %s', (input, expected) => {
    expect(normaliseSkill(input)).toBe(expected);
  });

  it('returns null for common English words', () => {
    expect(normaliseSkill('experience')).toBeNull();
    expect(normaliseSkill('excellent')).toBeNull();
    expect(normaliseSkill('and')).toBeNull();
  });

  it('returns null for empty/too-long strings', () => {
    expect(normaliseSkill('')).toBeNull();
    expect(normaliseSkill('a'.repeat(90))).toBeNull();
  });

  it('passes through canonical casing for known tools', () => {
    expect(normaliseSkill('Docker')).toBe('Docker');
    expect(normaliseSkill('Git')).toBe('Git');
  });
});

describe('normaliseAndDedup', () => {
  it('deduplicates case-insensitive', () => {
    const result = normaliseAndDedup(['React', 'react', 'reactjs', 'React.js']);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('React');
  });

  it('deduplicates across alias forms', () => {
    const result = normaliseAndDedup(['k8s', 'Kubernetes', 'K8S']);
    expect(result).toHaveLength(1);
  });

  it('removes null entries', () => {
    const result = normaliseAndDedup(['React', 'excellent', '', 'Docker']);
    expect(result).not.toContain(null);
    expect(result).not.toContain('excellent');
  });

  it('preserves order of first occurrence', () => {
    const result = normaliseAndDedup(['Python', 'Docker', 'py']);
    expect(result[0]).toBe('Python');
    expect(result[1]).toBe('Docker');
    expect(result).toHaveLength(2);
  });
});
