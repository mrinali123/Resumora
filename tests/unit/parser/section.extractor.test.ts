import { extractSections } from '../../../src/parser/extractors/section.extractor';

const SAMPLE_RESUME = `
John Doe
john.doe@example.com | +1 (555) 123-4567 | linkedin.com/in/johndoe

SUMMARY
Experienced full-stack engineer with 5 years of expertise in TypeScript and React.

EXPERIENCE
Senior Software Engineer | Google | Mountain View, CA
Jan 2022 – Present
• Led development of microservices architecture serving 10M+ users
• Reduced latency by 40% through Redis caching layer

Software Engineer | StartupXYZ
June 2020 – December 2021
• Built React dashboard with real-time WebSocket updates

EDUCATION
B.S. Computer Science
Stanford University
2016 – 2020

SKILLS
TypeScript, JavaScript, React, Node.js, PostgreSQL, Redis, Docker, Kubernetes

PROJECTS
Resume AI Platform
Technologies: Node.js, PostgreSQL, OpenAI, pgvector
• Built end-to-end resume parsing and job matching engine

CERTIFICATIONS
AWS Solutions Architect – Associate (2023)
Google Cloud Professional Data Engineer
`;

describe('extractSections', () => {
  let sections: ReturnType<typeof extractSections>;

  beforeAll(() => {
    sections = extractSections(SAMPLE_RESUME);
  });

  it('detects EXPERIENCE section', () => {
    expect(sections.EXPERIENCE).toBeDefined();
    expect(sections.EXPERIENCE).toContain('Google');
  });

  it('detects EDUCATION section', () => {
    expect(sections.EDUCATION).toBeDefined();
    expect(sections.EDUCATION).toContain('Stanford');
  });

  it('detects SKILLS section', () => {
    expect(sections.SKILLS).toBeDefined();
    expect(sections.SKILLS).toContain('TypeScript');
  });

  it('detects PROJECTS section', () => {
    expect(sections.PROJECTS).toBeDefined();
    expect(sections.PROJECTS).toContain('Resume AI');
  });

  it('detects CERTIFICATIONS section', () => {
    expect(sections.CERTIFICATIONS).toBeDefined();
    expect(sections.CERTIFICATIONS).toContain('AWS');
  });

  it('populates CONTACT section from header area', () => {
    expect(sections.CONTACT).toBeDefined();
    expect(sections.CONTACT).toContain('john.doe@example.com');
  });

  it('handles varied casing: all-caps, title case', () => {
    const mixedCase = `
Jane Smith\n\nWork Experience\nEngineer at ACME\n\nEducation\nMIT\n\ntechnical skills\nPython, Go
    `;
    const s = extractSections(mixedCase);
    expect(s.EXPERIENCE).toBeDefined();
    expect(s.EDUCATION).toBeDefined();
    expect(s.SKILLS).toBeDefined();
  });
});
