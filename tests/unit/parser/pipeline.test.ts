import { parseResumeSync } from '../../../src/parser';

const FULL_RESUME = `
Mrinali Parida
mrinali@example.com
+91 98765 43210

SUMMARY
Full-stack engineer with 3 years building scalable web applications.

WORK EXPERIENCE

Senior Software Engineer | TechCorp India | Bangalore
Jan 2024 – Present
• Led microservices platform serving 2M+ users
• Reduced API latency by 40% via Redis caching
• Mentored 3 junior developers

Software Engineer | StartupXYZ
June 2022 – December 2023
• Built React + TypeScript dashboard with WebSocket real-time updates
• Designed PostgreSQL schema for multi-tenant SaaS

EDUCATION

B.Tech Computer Science
NIT Rourkela
2018 – 2022 | CGPA: 8.9

TECHNICAL SKILLS
TypeScript, JavaScript, React, Node.js, PostgreSQL, Redis, Docker, Kubernetes, AWS, GraphQL, Python

PROJECTS

Resume Analyzer AI
Technologies: Node.js, PostgreSQL, pgvector, OpenAI
• End-to-end resume parsing and semantic job matching platform

Open Source CLI Tool
Tech Stack: Go, Cobra
• Developer productivity tool with 2K+ GitHub stars

CERTIFICATIONS
AWS Certified Solutions Architect – Associate
Google Cloud Professional Data Engineer
`;

describe('parseResumeSync — end-to-end', () => {
  let result: Awaited<ReturnType<typeof parseResumeSync>>;

  beforeAll(async () => {
    result = await parseResumeSync(FULL_RESUME);
  });

  // ── Contact ──────────────────────────────────────────────────────────────────

  it('extracts name', () => {
    expect(result.name).toBe('Mrinali Parida');
  });

  it('extracts email', () => {
    expect(result.email).toBe('mrinali@example.com');
  });

  it('extracts phone', () => {
    expect(result.phone).toBeDefined();
    expect(result.phone).not.toBeNull();
  });

  // ── Skills ───────────────────────────────────────────────────────────────────

  it('extracts skills array', () => {
    expect(result.skills.length).toBeGreaterThan(5);
  });

  it('normalises JS aliases', () => {
    // "TypeScript" should appear in canonical form
    expect(result.skills).toContain('TypeScript');
  });

  it('deduplicates skills', () => {
    const lowers = result.skills.map((s) => s.toLowerCase());
    const unique = new Set(lowers);
    expect(unique.size).toBe(lowers.length);
  });

  // ── Education ────────────────────────────────────────────────────────────────

  it('extracts at least one education entry', () => {
    expect(result.education.length).toBeGreaterThanOrEqual(1);
  });

  it('education entry has institution', () => {
    expect(result.education[0].institution).toBeTruthy();
  });

  it('education entry has startYear and endYear', () => {
    const edu = result.education[0];
    expect(edu.startYear).toBe('2018');
    expect(edu.endYear).toBe('2022');
  });

  // ── Experience ───────────────────────────────────────────────────────────────

  it('extracts multiple experience entries', () => {
    expect(result.experience.length).toBeGreaterThanOrEqual(2);
  });

  it('experience entry has company, role, duration, bulletPoints', () => {
    const exp = result.experience[0];
    expect(exp.company).toBeTruthy();
    expect(exp.role).toBeTruthy();
    expect(exp.duration).toBeTruthy();
    expect(exp.bulletPoints.length).toBeGreaterThan(0);
  });

  // ── Projects ─────────────────────────────────────────────────────────────────

  it('extracts project entries', () => {
    expect(result.projects.length).toBeGreaterThanOrEqual(1);
  });

  it('project has name and techStack', () => {
    const proj = result.projects[0];
    expect(proj.name).toBeTruthy();
    expect(Array.isArray(proj.techStack)).toBe(true);
  });

  // ── Certifications ────────────────────────────────────────────────────────────

  it('extracts certifications', () => {
    expect(result.certifications.length).toBeGreaterThanOrEqual(1);
  });

  // ── Output shape ─────────────────────────────────────────────────────────────

  it('always returns clean JSON with no undefined fields', () => {
    expect(result.name).not.toBeUndefined();
    expect(result.email).not.toBeUndefined();
    expect(result.phone).not.toBeUndefined();
    expect(Array.isArray(result.skills)).toBe(true);
    expect(Array.isArray(result.education)).toBe(true);
    expect(Array.isArray(result.experience)).toBe(true);
    expect(Array.isArray(result.projects)).toBe(true);
    expect(Array.isArray(result.certifications)).toBe(true);
  });

  it('returns null for missing fields, not undefined', () => {
    const minimal = `John Smith\n\nSKILLS\nPython`;
    return parseResumeSync(minimal).then((r) => {
      expect(r.email).toBeNull();
      expect(r.phone).toBeNull();
      expect(r.education).toEqual([]);
      expect(r.experience).toEqual([]);
    });
  });

  // ── Meta ─────────────────────────────────────────────────────────────────────

  it('includes _meta with confidenceScore', () => {
    expect(result._meta.confidenceScore).toBeGreaterThan(0);
    expect(result._meta.confidenceScore).toBeLessThanOrEqual(1);
  });

  it('confidence is high for a well-structured resume', () => {
    expect(result._meta.confidenceScore).toBeGreaterThanOrEqual(0.6);
  });
});
