// Builds a 3-sentence recruiter note in plain recruiter voice.
// Entirely deterministic — no LLM, no random variation.
//
// Sentence 1: opening verdict (what's the dominant signal?)
// Sentence 2: supporting detail (evidence for the verdict)
// Sentence 3: specific recommendation (what should the recruiter do next?)

import type { RedFlag, Strength, RecruiterDecision, ResumeJson } from '../types';

export function buildRecruiterNotes(
  decision: RecruiterDecision,
  probability: number,
  redFlags: RedFlag[],
  strengths: Strength[],
  resume: ResumeJson,
): string {
  const topFlag = redFlags[0];
  const topStrength = strengths[0];

  // ── Sentence 1: opening verdict ───────────────────────────────────────────

  let sentence1: string;

  if (decision === 'Reject') {
    if (topFlag?.severity === 'CRITICAL') {
      sentence1 = `${topFlag.description} — this is a blocking issue that prevents further consideration.`;
    } else if (topFlag) {
      sentence1 = `Profile does not meet the minimum bar: ${topFlag.description.toLowerCase()}.`;
    } else {
      sentence1 = `Candidate scores below threshold (${probability}/100) on multiple evaluation dimensions.`;
    }
  } else if (decision === 'Shortlist') {
    if (topStrength) {
      sentence1 = `Strong candidate — ${topStrength.description.toLowerCase()}.`;
    } else {
      sentence1 = `Solid overall profile that meets the core requirements (${probability}/100).`;
    }
  } else {
    if (topStrength && topFlag) {
      sentence1 = `Mixed profile — ${topStrength.description.toLowerCase()}, but ${topFlag.description.toLowerCase()}.`;
    } else if (topFlag) {
      sentence1 = `Borderline profile — primary concern: ${topFlag.description.toLowerCase()}.`;
    } else {
      sentence1 = `Candidate shows potential but has not fully demonstrated fit for this role.`;
    }
  }

  // ── Sentence 2: supporting detail ─────────────────────────────────────────

  let sentence2: string;

  const companies = [...new Set(resume.experience.map((e) => e.company))].slice(0, 2);
  const topSkills = resume.skills.slice(0, 3).join(', ');

  if (decision === 'Reject') {
    if (redFlags.length > 1) {
      const second = redFlags[1];
      sentence2 = `Additionally: ${second.description.toLowerCase()}.`;
    } else if (topStrength) {
      sentence2 = `${topStrength.description} is noted positively but does not offset the primary gap.`;
    } else {
      sentence2 = `Resume lacks the evidence needed to justify advancing to a screening call.`;
    }
  } else if (decision === 'Shortlist') {
    const detail = topStrength?.evidence;
    if (companies.length > 0 && topSkills) {
      sentence2 = `${companies.join(' → ')} background with ${topSkills}${detail ? `; ${detail}` : ''}.`;
    } else if (detail) {
      sentence2 = `${detail}.`;
    } else {
      sentence2 = `Profile is well-rounded with no blocking gaps identified.`;
    }
  } else {
    // Maybe — surface the top flag's evidence if available
    if (topFlag?.evidence) {
      sentence2 = `Key gap: ${topFlag.evidence}.`;
    } else if (topStrength?.evidence) {
      sentence2 = `Notable strength: ${topStrength.evidence}.`;
    } else {
      sentence2 = `Recommend a brief screen to assess areas that could not be evaluated from the resume alone.`;
    }
  }

  // ── Sentence 3: recommendation ────────────────────────────────────────────

  let sentence3: string;

  if (decision === 'Reject') {
    const category = topFlag?.category;
    if (category === 'critical_skill_gap' || category === 'substantial_skill_gap') {
      sentence3 = `Do not advance — skill gaps are too wide for this role without significant upskilling first.`;
    } else if (category === 'no_work_evidence') {
      sentence3 = `Do not advance — resume requires substantial work before it is ready for submission.`;
    } else {
      sentence3 = `Do not advance to next stage; reapplication welcome once identified gaps are addressed.`;
    }
  } else if (decision === 'Shortlist') {
    sentence3 = `Recommend scheduling a technical screen.`;
  } else {
    const category = topFlag?.category;
    if (category === 'experience_shortfall') {
      sentence3 = `Phone screen recommended — ask candidate to clarify actual depth of experience before proceeding.`;
    } else if (category === 'zero_quantified_impact' || category === 'weak_action_verbs') {
      sentence3 = `Proceed to a brief phone screen; ask candidate to walk through specific project outcomes and scale.`;
    } else {
      sentence3 = `Short screening call recommended to clarify the identified gaps before making a final decision.`;
    }
  }

  return `${sentence1} ${sentence2} ${sentence3}`;
}
