"use client";

import { useState, useEffect, useCallback } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { AlertTriangle, CheckCircle, X, FileText, Loader2, RefreshCw, Eye } from "lucide-react";
import {
  api,
  type Resume,
  type AtsAnalysisResult,
  type AtsAnalysisSummary,
  type RedFlag,
  type AtsStrength,
  type MissingRequirement,
} from "@/lib/api-client";
import { getScoreColor, formatDate, formatRelative } from "@/lib/utils";

// ── Decision badge ────────────────────────────────────────────────────────────
function DecisionBadge({ decision }: { decision: string }) {
  const styles: Record<string, { bg: string; color: string; border: string }> = {
    Shortlist: { bg: "var(--success-dim)",   color: "var(--success)", border: "var(--success-border)" },
    Maybe:     { bg: "rgba(210,153,34,0.12)", color: "#d29922",        border: "rgba(210,153,34,0.25)" },
    Reject:    { bg: "var(--danger-dim)",     color: "var(--danger)",  border: "var(--danger-border)" },
  };
  const s = styles[decision] ?? styles.Maybe;
  return (
    <span
      className="inline-flex items-center px-3 py-1 rounded-full font-semibold"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, fontSize: "13px" }}
    >
      {decision}
    </span>
  );
}

function SeverityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = { REQUIRED: "badge-danger", PREFERRED: "badge-warning" };
  return <span className={`badge ${map[priority] ?? "badge-neutral"}`}>{priority}</span>;
}

function RedFlagSeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    CRITICAL: "badge-danger",
    HIGH: "badge-danger",
    MEDIUM: "badge-warning",
    LOW: "badge-neutral",
  };
  return <span className={`badge ${map[severity] ?? "badge-neutral"}`} style={{ fontSize: "10px" }}>{severity}</span>;
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div
        className="w-14 h-14 rounded-xl flex items-center justify-center mb-4"
        style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-border)" }}
      >
        <Eye className="w-6 h-6" style={{ color: "var(--accent)" }} />
      </div>
      <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--ink-1)", marginBottom: "8px" }}>
        No processed resumes
      </h2>
      <p className="caption mb-4">Upload and process a resume to run your first recruiter simulation.</p>
      <a href="/upload" className="btn btn-primary" style={{ height: "34px", fontSize: "12px", paddingInline: "16px" }}>
        Upload Resume
      </a>
    </div>
  );
}

// ── Past analysis item ────────────────────────────────────────────────────────
function PastItem({ item, onClick }: { item: AtsAnalysisSummary; onClick: () => void }) {
  const decisionCls =
    item.recruiterDecision === "Shortlist" ? "badge-success" :
    item.recruiterDecision === "Maybe" ? "badge-warning" : "badge-danger";
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-md px-3 py-2.5 flex items-center justify-between gap-3"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)", marginBottom: "6px" }}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span style={{ fontSize: "13px", fontWeight: 600, color: getScoreColor(item.overallScore), fontVariantNumeric: "tabular-nums" }}>
            {item.shortlistProbability}%
          </span>
          <span style={{ fontSize: "11px", color: "var(--ink-3)" }}>shortlist prob.</span>
        </div>
        <p style={{ fontSize: "11px", color: "var(--ink-3)" }}>{formatRelative(item.createdAt)}</p>
      </div>
      <span className={`badge ${decisionCls}`} style={{ fontSize: "10px", flexShrink: 0 }}>
        {item.recruiterDecision}
      </span>
    </button>
  );
}

// ── Recruiter result display ──────────────────────────────────────────────────
function RecruiterDisplay({ data, resumeName }: { data: AtsAnalysisResult; resumeName?: string }) {
  const r = data.recruiter;
  const prob = r.shortlistProbability;
  const probColor = prob >= 70 ? "var(--success)" : prob >= 45 ? "#d29922" : "var(--danger)";
  const redFlags = r.topRedFlags as RedFlag[];
  const strengths = r.topStrengths as AtsStrength[];
  const missingReqs = r.missingRequirements as MissingRequirement[];

  return (
    <>
      {/* Decision summary */}
      <div className="card p-5 mb-4">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="section-label mb-2">Recruiter Decision</p>
            <DecisionBadge decision={r.decision} />
            {resumeName && (
              <div className="flex items-center gap-1.5 mt-2">
                <FileText className="w-3 h-3" style={{ color: "var(--ink-3)" }} />
                <p style={{ fontSize: "12px", color: "var(--ink-3)" }}>{resumeName}</p>
              </div>
            )}
          </div>

          <div>
            <p className="section-label mb-2">Shortlist Probability</p>
            <div className="flex items-baseline gap-1">
              <span style={{ fontSize: "36px", fontWeight: 800, letterSpacing: "-0.04em", color: probColor, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                {prob}
              </span>
              <span style={{ fontSize: "20px", color: "var(--ink-2)" }}>%</span>
            </div>
            <div className="progress-track mt-2" style={{ width: "140px" }}>
              <div className="progress-fill" style={{ width: `${prob}%`, background: probColor }} />
            </div>
          </div>
        </div>
      </div>

      {/* Strengths + red flags */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: "var(--success)" }} />
            <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-1)" }}>What the recruiter likes</h2>
          </div>
          <div className="space-y-2.5">
            {strengths.length === 0 ? (
              <p style={{ fontSize: "13px", color: "var(--ink-3)" }}>No standout strengths identified.</p>
            ) : (
              strengths.map((s, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" style={{ background: "var(--success)" }} />
                  <div className="min-w-0">
                    <p style={{ fontSize: "13px", color: "var(--ink-2)", lineHeight: "1.5" }}>{s.description}</p>
                    {s.evidence && <p style={{ fontSize: "11px", color: "var(--ink-3)", marginTop: "2px" }}>{s.evidence}</p>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: "var(--warning)" }} />
            <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-1)" }}>Red flags</h2>
          </div>
          <div className="space-y-2.5">
            {redFlags.length === 0 ? (
              <p style={{ fontSize: "13px", color: "var(--ink-3)" }}>No red flags detected.</p>
            ) : (
              redFlags.map((f, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" style={{ background: "var(--warning)" }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p style={{ fontSize: "13px", color: "var(--ink-2)", lineHeight: "1.5", flex: 1 }}>{f.description}</p>
                      <RedFlagSeverityBadge severity={f.severity} />
                    </div>
                    {f.evidence && <p style={{ fontSize: "11px", color: "var(--ink-3)" }}>{f.evidence}</p>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Missing requirements */}
      {missingReqs.length > 0 && (
        <div className="card p-5 mb-4">
          <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-1)", marginBottom: "16px" }}>
            Missing Requirements
          </h2>
          <div className="space-y-2">
            {missingReqs.map(({ item, priority }, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-md px-3 py-2.5"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
              >
                <div className="flex items-center gap-2.5">
                  <X className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--ink-3)" }} />
                  <span style={{ fontSize: "13px", color: "var(--ink-2)" }}>{item}</span>
                </div>
                <SeverityBadge priority={priority} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recruiter notes */}
      {r.recruiterNotes && (
        <div className="card p-5">
          <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-1)", marginBottom: "12px" }}>
            Simulation Notes
          </h2>
          <p style={{ fontSize: "13px", color: "var(--ink-2)", lineHeight: "1.7" }}>{r.recruiterNotes}</p>
        </div>
      )}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function RecruiterPage() {
  const [resumes, setResumes] = useState<Resume[] | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [jd, setJd] = useState("");
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState("");
  const [result, setResult] = useState<AtsAnalysisResult | null>(null);
  const [pastAnalyses, setPastAnalyses] = useState<AtsAnalysisSummary[]>([]);
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

  const loadPast = useCallback(async (resumeId: string) => {
    if (!resumeId) return;
    try {
      const list = await api.ats.listByResume(resumeId);
      setPastAnalyses(list);
    } catch {
      setPastAnalyses([]);
    }
  }, []);

  useEffect(() => {
    if (selectedId) {
      setResult(null);
      loadPast(selectedId);
    }
  }, [selectedId, loadPast]);

  const runSimulation = async () => {
    if (!selectedId) return;
    setRunning(true);
    setRunError("");
    setResult(null);
    try {
      const res = await api.ats.analyze(selectedId, jd.trim() || undefined);
      setResult(res);
      loadPast(selectedId);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : "Simulation failed. Please try again.");
    } finally {
      setRunning(false);
    }
  };

  const openPast = async (id: string) => {
    setRunning(true);
    setRunError("");
    try {
      const res = await api.ats.get(id);
      setResult(res);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : "Failed to load simulation.");
    } finally {
      setRunning(false);
    }
  };

  if (pageLoading) {
    return (
      <AppLayout>
        <div className="p-6 max-w-4xl mx-auto">
          <div className="skeleton h-7 w-40 mb-2 rounded" />
          <div className="skeleton h-4 w-64 mb-6 rounded" />
          <div className="skeleton h-44 w-full rounded-xl mb-4" />
        </div>
      </AppLayout>
    );
  }

  const processed = (resumes ?? []).filter((r) => r.status === "PROCESSED");
  const selectedResume = processed.find((r) => r.id === selectedId);

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto page-in">
        <div className="mb-6">
          <h1 className="page-title mb-1">Recruiter Mode</h1>
          <p className="caption">Simulate a recruiter reviewing your resume — see decision, probability, red flags, and notes.</p>
        </div>

        {processed.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Controls */}
            <div className="card p-5 mb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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
                <div className="flex items-end">
                  <button
                    className="btn btn-primary w-full"
                    style={{ height: "36px", fontSize: "13px" }}
                    onClick={runSimulation}
                    disabled={running || !selectedId}
                  >
                    {running ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Simulating...</>
                    ) : (
                      <><RefreshCw className="w-3.5 h-3.5" /> Run Simulation</>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="section-label block mb-2" htmlFor="jd-recruiter">
                  Job Description{" "}
                  <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>(optional — makes simulation role-specific)</span>
                </label>
                <textarea
                  id="jd-recruiter"
                  rows={4}
                  value={jd}
                  onChange={(e) => setJd(e.target.value)}
                  placeholder="Paste the job description here to see how a recruiter would evaluate you for this specific role..."
                  className="input w-full p-3 resize-none"
                  style={{ lineHeight: "1.6" }}
                />
              </div>

              {runError && (
                <div className="mt-3 rounded-md px-3 py-2.5" style={{ background: "var(--danger-dim)", border: "1px solid var(--danger-border)" }}>
                  <p style={{ fontSize: "13px", color: "var(--danger)" }}>{runError}</p>
                </div>
              )}
            </div>

            {/* Past simulations */}
            {!result && pastAnalyses.length > 0 && (
              <div className="card p-5 mb-4">
                <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-1)", marginBottom: "12px" }}>
                  Previous Simulations
                  {selectedResume && (
                    <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>
                      {" "}· {selectedResume.title || selectedResume.originalFileName}
                    </span>
                  )}
                </h2>
                {pastAnalyses.map((item) => (
                  <PastItem key={item.id} item={item} onClick={() => openPast(item.id)} />
                ))}
              </div>
            )}

            {/* Loading */}
            {running && !result && (
              <div className="flex items-center justify-center py-16">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--accent)" }} />
                  <p style={{ fontSize: "13px", color: "var(--ink-2)" }}>Running recruiter simulation...</p>
                </div>
              </div>
            )}

            {/* Result */}
            {result && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p style={{ fontSize: "13px", color: "var(--ink-2)" }}>
                    {selectedResume?.title || selectedResume?.originalFileName} · {formatDate(result.createdAt)}
                  </p>
                  <button
                    className="btn btn-ghost"
                    style={{ height: "28px", fontSize: "11px" }}
                    onClick={() => setResult(null)}
                  >
                    {pastAnalyses.length > 0 ? "History" : "Close"}
                  </button>
                </div>
                <RecruiterDisplay data={result} resumeName={selectedResume?.title || selectedResume?.originalFileName} />
              </>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
