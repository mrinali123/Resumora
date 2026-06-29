"use client";

import { useState, useEffect, useCallback } from "react";
import AppLayout from "@/components/layout/AppLayout";
import {
  CheckCircle,
  X,
  AlertTriangle,
  Loader2,
  ArrowRight,
  FileText,
  Briefcase,
} from "lucide-react";
import {
  api,
  type Resume,
  type JobFitResult,
  type JobFitHistoryItem,
} from "@/lib/api-client";
import { getScoreColor, formatDate, formatRelative } from "@/lib/utils";

// ── Match score display ───────────────────────────────────────────────────────
function MatchScore({ score }: { score: number }) {
  const color = getScoreColor(score);
  const label = score >= 80 ? "Strong Match" : score >= 60 ? "Partial Match" : "Weak Match";
  const badgeCls = score >= 80 ? "badge-success" : score >= 60 ? "badge-warning" : "badge-danger";
  return (
    <div className="flex items-center gap-5">
      <div>
        <span style={{ fontSize: "48px", fontWeight: 800, letterSpacing: "-0.05em", color, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {score}
        </span>
        <span style={{ fontSize: "24px", fontWeight: 400, color: "var(--ink-2)" }}>%</span>
      </div>
      <div>
        <span className={`badge ${badgeCls}`}>{label}</span>
        <p className="caption mt-1.5">Overall match score</p>
      </div>
    </div>
  );
}

function SkillRow({ skill, found }: { skill: string; found: boolean }) {
  return (
    <div
      className="flex items-center gap-2.5 py-2 px-3 rounded-md"
      style={{
        background: found ? "var(--success-dim)" : "transparent",
        border: `1px solid ${found ? "var(--success-border)" : "var(--border)"}`,
        marginBottom: "6px",
      }}
    >
      {found ? (
        <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--success)" }} />
      ) : (
        <X className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--danger)" }} />
      )}
      <span style={{ fontSize: "13px", color: found ? "var(--success)" : "var(--ink-2)" }}>{skill}</span>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div
        className="w-14 h-14 rounded-xl flex items-center justify-center mb-4"
        style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-border)" }}
      >
        <Briefcase className="w-6 h-6" style={{ color: "var(--accent)" }} />
      </div>
      <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--ink-1)", marginBottom: "8px" }}>
        No processed resumes
      </h2>
      <p className="caption mb-4">Upload and process a resume before matching against job descriptions.</p>
      <a href="/upload" className="btn btn-primary" style={{ height: "34px", fontSize: "12px", paddingInline: "16px" }}>
        Upload Resume
      </a>
    </div>
  );
}

// ── Past match row ────────────────────────────────────────────────────────────
function PastMatchRow({ item, onClick }: { item: JobFitHistoryItem; onClick: () => void }) {
  const color = getScoreColor(item.overallScore);
  return (
    <tr
      onClick={onClick}
      style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-2)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--ink-3)" }} />
          <span style={{ fontSize: "13px", color: "var(--ink-1)" }}>
            {item.resume?.title ?? item.resumeId.slice(0, 8)}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span style={{ fontSize: "13px", color: "var(--ink-2)" }}>
          {item.job?.title ?? "—"}{item.job?.company ? ` · ${item.job.company}` : ""}
        </span>
      </td>
      <td className="px-4 py-3">
        <span style={{ fontSize: "13px", fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
          {item.overallScore}%
        </span>
      </td>
      <td className="px-4 py-3">
        <span style={{ fontSize: "12px", color: "var(--ink-3)" }}>{formatRelative(item.createdAt)}</span>
      </td>
    </tr>
  );
}

// ── Result display ────────────────────────────────────────────────────────────
function JobFitDisplay({
  result,
  jobTitle,
  jobCompany,
}: {
  result: JobFitResult;
  jobTitle: string;
  jobCompany?: string;
}) {
  const matchScore = Math.round(result.atsScore);
  const kw = result.keywordCoverage ?? { covered: [], missing: [], coverageRate: 0 };

  const componentBars = [
    { label: "Skills", score: Math.round(result.skillScore) },
    { label: "Experience", score: Math.round(result.experienceScore) },
    { label: "Education", score: Math.round(result.educationScore) },
    { label: "Keywords", score: Math.round(result.keywordScore) },
    { label: "Semantic", score: Math.round(result.semanticScore) },
  ];

  return (
    <>
      <div className="card p-5 mb-4">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            {jobTitle && (
              <p style={{ fontSize: "16px", fontWeight: 700, color: "var(--ink-1)", letterSpacing: "-0.02em" }}>
                {jobTitle}
              </p>
            )}
            {jobCompany && (
              <p style={{ fontSize: "13px", color: "var(--ink-2)", marginTop: "2px" }}>{jobCompany}</p>
            )}
            {!jobTitle && (
              <p style={{ fontSize: "13px", color: "var(--ink-2)" }}>Job Match Results</p>
            )}
          </div>
          <MatchScore score={matchScore} />
        </div>

        <div className="divider mt-4 mb-4" />

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {componentBars.map(({ label, score }) => (
            <div key={label}>
              <div className="flex items-center justify-between mb-1.5">
                <span style={{ fontSize: "12px", color: "var(--ink-2)" }}>{label}</span>
                <span style={{ fontSize: "12px", fontWeight: 600, color: getScoreColor(score) }}>{score}</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${score}%`, background: getScoreColor(score) }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-1)" }}>Matching Skills</h2>
            <span className="badge badge-success">{result.matchingSkills.length} matched</span>
          </div>
          {result.matchingSkills.length === 0 ? (
            <p style={{ fontSize: "13px", color: "var(--ink-3)" }}>No matching skills detected.</p>
          ) : (
            result.matchingSkills.map((s) => <SkillRow key={s} skill={s} found />)
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-1)" }}>Skill Gaps</h2>
            <span className="badge badge-danger">{result.missingRequiredSkills.length} missing</span>
          </div>
          {result.missingRequiredSkills.length === 0 ? (
            <p style={{ fontSize: "13px", color: "var(--ink-3)" }}>No required skill gaps found.</p>
          ) : (
            result.missingRequiredSkills.map((s) => <SkillRow key={s} skill={s} found={false} />)
          )}
        </div>
      </div>

      {(kw.covered.length > 0 || kw.missing.length > 0) && (
        <div className="card p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-1)" }}>Keyword Coverage</h2>
            <span style={{ fontSize: "13px", fontWeight: 700, color: getScoreColor(Math.round(kw.coverageRate * 100)), fontVariantNumeric: "tabular-nums" }}>
              {Math.round(kw.coverageRate * 100)}%
            </span>
          </div>
          {kw.covered.length > 0 && (
            <div className="mb-3">
              <p className="section-label mb-2">Found in resume</p>
              <div className="flex flex-wrap gap-1.5">
                {kw.covered.map((k) => (
                  <span key={k} className="badge" style={{ background: "var(--success-dim)", color: "var(--success)", borderColor: "var(--success-border)", fontSize: "11px" }}>
                    {k}
                  </span>
                ))}
              </div>
            </div>
          )}
          {kw.covered.length > 0 && kw.missing.length > 0 && <div className="divider mb-3" />}
          {kw.missing.length > 0 && (
            <div>
              <p className="section-label mb-2">Missing from resume</p>
              <div className="flex flex-wrap gap-1.5">
                {kw.missing.map((k) => (
                  <span key={k} className="badge" style={{ background: "var(--surface-3)", color: "var(--ink-3)", fontSize: "11px" }}>
                    {k}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {result.missingPreferredSkills.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: "var(--warning)" }} />
            <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-1)" }}>Preferred Skills Gap</h2>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {result.missingPreferredSkills.map((s) => (
              <span key={s} className="badge badge-warning" style={{ fontSize: "11px" }}>{s}</span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function JobMatchingPage() {
  const [resumes, setResumes] = useState<Resume[] | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobCompany, setJobCompany] = useState("");
  const [jdText, setJdText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<JobFitResult | null>(null);
  const [activeJobTitle, setActiveJobTitle] = useState("");
  const [activeJobCompany, setActiveJobCompany] = useState("");
  const [pastMatches, setPastMatches] = useState<JobFitHistoryItem[]>([]);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    api.resumes.list()
      .then((list) => {
        setResumes(list);
        const first = list.find((r) => r.status === "PROCESSED");
        if (first) setSelectedId(first.id);
      })
      .catch(() => setResumes([]))
      .finally(() => setPageLoading(false));
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await api.jobFit.history();
      setPastMatches(res.data ?? []);
    } catch {
      setPastMatches([]);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const analyzeMatch = async () => {
    if (!selectedId || !jdText.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const title = jobTitle.trim() || "Untitled Job";
      const job = await api.jobs.create(title, jdText.trim(), jobCompany.trim() || undefined);
      const fit = await api.jobFit.analyze(selectedId, job.id);
      setActiveJobTitle(title);
      setActiveJobCompany(jobCompany.trim());
      setResult(fit);
      loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const openHistoryItem = async (item: JobFitHistoryItem) => {
    setLoading(true);
    setError("");
    try {
      const fit = await api.jobFit.analyze(item.resumeId, item.jobId);
      setActiveJobTitle(item.job?.title ?? "");
      setActiveJobCompany(item.job?.company ?? "");
      setResult(fit);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load match.");
    } finally {
      setLoading(false);
    }
  };

  if (pageLoading) {
    return (
      <AppLayout>
        <div className="p-6 max-w-5xl mx-auto">
          <div className="skeleton h-7 w-40 mb-2 rounded" />
          <div className="skeleton h-4 w-64 mb-6 rounded" />
          <div className="skeleton h-64 w-full rounded-xl mb-4" />
        </div>
      </AppLayout>
    );
  }

  const processed = (resumes ?? []).filter((r) => r.status === "PROCESSED");

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto page-in">
        <div className="mb-6">
          <h1 className="page-title mb-1">Job Matching</h1>
          <p className="caption">Paste a job description to see your match score and skill gap analysis.</p>
        </div>

        {processed.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Input */}
            <div className="card p-5 mb-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="section-label block mb-2">Resume</label>
                  <select
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                    className="input w-full"
                    style={{ height: "36px", fontSize: "13px" }}
                  >
                    {processed.map((r) => (
                      <option key={r.id} value={r.id}>{r.title || r.originalFileName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="section-label block mb-2">Job Title</label>
                  <input
                    type="text"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="e.g. Senior Software Engineer"
                    className="input w-full"
                    style={{ height: "36px", fontSize: "13px" }}
                  />
                </div>
                <div>
                  <label className="section-label block mb-2">
                    Company <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={jobCompany}
                    onChange={(e) => setJobCompany(e.target.value)}
                    placeholder="e.g. Google"
                    className="input w-full"
                    style={{ height: "36px", fontSize: "13px" }}
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="section-label block mb-2" htmlFor="jd-input">
                  Job Description <span style={{ color: "var(--danger)", fontWeight: 600 }}>*</span>
                </label>
                <textarea
                  id="jd-input"
                  rows={6}
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                  placeholder="Paste the full job description here...&#10;&#10;Example: Senior Software Engineer — Requirements: 5+ years experience, TypeScript, React, Node.js..."
                  className="input w-full p-3 resize-none"
                  style={{ lineHeight: "1.6" }}
                />
                <p style={{ fontSize: "11px", color: "var(--ink-3)", marginTop: "4px" }}>
                  {jdText.length} characters
                </p>
              </div>

              <div className="flex items-center justify-end">
                <button
                  className="btn btn-primary"
                  style={{ height: "36px", fontSize: "13px", paddingInline: "20px" }}
                  onClick={analyzeMatch}
                  disabled={!jdText.trim() || !selectedId || loading}
                >
                  {loading ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing...</>
                  ) : (
                    <>Analyze Match <ArrowRight className="w-3.5 h-3.5" /></>
                  )}
                </button>
              </div>

              {error && (
                <div className="mt-3 rounded-md px-3 py-2.5" style={{ background: "var(--danger-dim)", border: "1px solid var(--danger-border)" }}>
                  <p style={{ fontSize: "13px", color: "var(--danger)" }}>{error}</p>
                </div>
              )}
            </div>

            {/* Loading */}
            {loading && !result && (
              <div className="flex items-center justify-center py-16">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--accent)" }} />
                  <p style={{ fontSize: "13px", color: "var(--ink-2)" }}>Analyzing job match...</p>
                </div>
              </div>
            )}

            {/* Result */}
            {result && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p style={{ fontSize: "13px", color: "var(--ink-2)" }}>
                    {activeJobTitle && (
                      <><strong>{activeJobTitle}</strong>{activeJobCompany ? ` · ${activeJobCompany}` : ""} · </>
                    )}
                    {result.analyzedAt ? formatDate(result.analyzedAt) : "Just now"}
                  </p>
                  <button
                    className="btn btn-ghost"
                    style={{ height: "28px", fontSize: "11px" }}
                    onClick={() => setResult(null)}
                  >
                    Clear
                  </button>
                </div>
                <JobFitDisplay result={result} jobTitle={activeJobTitle} jobCompany={activeJobCompany} />
              </>
            )}

            {/* Past matches */}
            {!result && pastMatches.length > 0 && (
              <div className="card overflow-hidden">
                <div className="px-5 py-3.5" style={{ borderBottom: "1px solid var(--border)" }}>
                  <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-1)" }}>Previous Matches</h2>
                </div>
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      {["Resume", "Job", "Score", "Date"].map((h) => (
                        <th key={h} className="text-left px-4 py-2.5" style={{ fontSize: "11px", color: "var(--ink-3)", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pastMatches.map((item) => (
                      <PastMatchRow key={item.id} item={item} onClick={() => openHistoryItem(item)} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
