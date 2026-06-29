"use client";

import { useState, useEffect, useCallback } from "react";
import AppLayout from "@/components/layout/AppLayout";
import {
  Plus,
  Minus,
  ArrowUp,
  TrendingUp,
  TrendingDown,
  GitCompare,
  Loader2,
} from "lucide-react";
import {
  api,
  type Resume,
  type ComparisonResult,
  type ComparisonListItem,
} from "@/lib/api-client";
import { getScoreColor, formatDate, formatRelative } from "@/lib/utils";

// ── Score delta ───────────────────────────────────────────────────────────────
function ScoreDelta({ delta }: { delta: number }) {
  const positive = delta > 0;
  return (
    <div className="flex items-center gap-1.5">
      {positive && <ArrowUp className="w-3.5 h-3.5" style={{ color: "var(--success)" }} />}
      <span
        style={{
          fontSize: "13px",
          fontWeight: 600,
          color: positive ? "var(--success)" : delta < 0 ? "var(--danger)" : "var(--ink-3)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {positive ? "+" : ""}{delta}
      </span>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ reason }: { reason: "no-resumes" | "need-two" }) {
  if (reason === "no-resumes") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center mb-4"
          style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-border)" }}
        >
          <GitCompare className="w-6 h-6" style={{ color: "var(--accent)" }} />
        </div>
        <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--ink-1)", marginBottom: "8px" }}>
          No processed resumes
        </h2>
        <p className="caption mb-4">Upload at least two resumes to compare them.</p>
        <a href="/upload" className="btn btn-primary" style={{ height: "34px", fontSize: "12px", paddingInline: "16px" }}>
          Upload Resume
        </a>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div
        className="w-14 h-14 rounded-xl flex items-center justify-center mb-4"
        style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-border)" }}
      >
        <GitCompare className="w-6 h-6" style={{ color: "var(--accent)" }} />
      </div>
      <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--ink-1)", marginBottom: "8px" }}>
        Need at least 2 processed resumes
      </h2>
      <p className="caption mb-4">Upload another resume to enable comparison.</p>
      <a href="/upload" className="btn btn-primary" style={{ height: "34px", fontSize: "12px", paddingInline: "16px" }}>
        Upload Another
      </a>
    </div>
  );
}

// ── Past comparison row ────────────────────────────────────────────────────────
function PastRow({ item, onClick }: { item: ComparisonListItem; onClick: () => void }) {
  const delta = item.improvementScoreDelta;
  const positive = delta > 0;
  return (
    <tr
      onClick={onClick}
      style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-2)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
    >
      <td className="px-4 py-3">
        <span style={{ fontSize: "13px", color: "var(--ink-1)" }}>
          {item.resumeA?.title ?? "Resume A"}
        </span>
      </td>
      <td className="px-4 py-3">
        <span style={{ fontSize: "13px", color: "var(--ink-1)" }}>
          {item.resumeB?.title ?? "Resume B"}
        </span>
      </td>
      <td className="px-4 py-3">
        <span
          style={{
            fontSize: "13px",
            fontWeight: 700,
            color: positive ? "var(--success)" : delta < 0 ? "var(--danger)" : "var(--ink-3)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {positive ? "+" : ""}{delta} pts
        </span>
      </td>
      <td className="px-4 py-3">
        <span style={{ fontSize: "12px", color: "var(--ink-3)" }}>{formatRelative(item.createdAt)}</span>
      </td>
    </tr>
  );
}

// ── Comparison result display ─────────────────────────────────────────────────
function ComparisonDisplay({
  result,
  resumeAName,
  resumeBName,
}: {
  result: ComparisonResult;
  resumeAName?: string;
  resumeBName?: string;
}) {
  const delta = result.improvementScoreDelta;
  const positive = delta > 0;
  const deltaColor = positive ? "var(--success)" : delta < 0 ? "var(--danger)" : "var(--ink-3)";
  const deltaBg = positive ? "var(--success-dim)" : delta < 0 ? "var(--danger-dim)" : "var(--surface-2)";
  const deltaBorder = positive ? "var(--success-border)" : delta < 0 ? "var(--danger-border)" : "var(--border)";
  const DeltaIcon = positive ? TrendingUp : TrendingDown;

  return (
    <>
      {/* Delta summary */}
      <div
        className="flex items-center gap-4 rounded-lg px-5 py-4 mb-4"
        style={{ background: deltaBg, border: `1px solid ${deltaBorder}` }}
      >
        <DeltaIcon className="w-5 h-5 flex-shrink-0" style={{ color: deltaColor }} />
        <div>
          <p style={{ fontSize: "14px", fontWeight: 600, color: deltaColor }}>
            {positive ? "+" : ""}{delta} point {positive ? "improvement" : delta < 0 ? "regression" : "no change"}
          </p>
          {result.isMeaningfulUpgrade && (
            <p style={{ fontSize: "12px", color: "var(--ink-2)", marginTop: "2px" }}>
              Marked as a meaningful upgrade by the analysis engine.
            </p>
          )}
          {result.hasRegressions && (
            <p style={{ fontSize: "12px", color: "var(--warning)", marginTop: "2px" }}>
              Some regressions detected — review added/removed skills below.
            </p>
          )}
        </div>
      </div>

      {/* Resume names */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {[
          { label: "Before (A)", name: resumeAName ?? "Resume A" },
          { label: "After (B)", name: resumeBName ?? "Resume B" },
        ].map(({ label, name }, i) => (
          <div key={i} className="card p-4">
            <p className="section-label mb-1.5">{label}</p>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-1)" }}>{name}</p>
          </div>
        ))}
      </div>

      {/* Skills changes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Plus className="w-4 h-4 flex-shrink-0" style={{ color: "var(--success)" }} />
            <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-1)" }}>Added</h2>
            <span className="badge badge-success ml-auto">{result.addedSkills.length}</span>
          </div>
          {result.addedSkills.length === 0 ? (
            <p style={{ fontSize: "13px", color: "var(--ink-3)" }}>No new skills added.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {result.addedSkills.map((s) => (
                <span
                  key={s}
                  className="badge"
                  style={{ background: "var(--success-dim)", color: "var(--success)", border: "1px solid var(--success-border)" }}
                >
                  + {s}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Minus className="w-4 h-4 flex-shrink-0" style={{ color: "var(--ink-3)" }} />
            <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-1)" }}>Removed</h2>
            <span className="badge badge-neutral ml-auto">{result.removedSkills.length}</span>
          </div>
          {result.removedSkills.length === 0 ? (
            <p style={{ fontSize: "13px", color: "var(--ink-3)" }}>No skills removed.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {result.removedSkills.map((s) => (
                <span
                  key={s}
                  className="badge badge-neutral"
                  style={{ textDecoration: "line-through", opacity: 0.7 }}
                >
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Explanation */}
      {result.explanation && (
        <div className="card p-5 mb-4">
          <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-1)", marginBottom: "12px" }}>
            What changed
          </h2>
          <p style={{ fontSize: "13px", color: "var(--ink-2)", lineHeight: "1.7" }}>{result.explanation}</p>
        </div>
      )}

      {/* Recruiter summary */}
      {result.recruiterSummary && (
        <div className="card p-5">
          <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-1)", marginBottom: "12px" }}>
            Recruiter Perspective
          </h2>
          <p style={{ fontSize: "13px", color: "var(--ink-2)", lineHeight: "1.7" }}>{result.recruiterSummary}</p>
        </div>
      )}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ComparisonPage() {
  const [resumes, setResumes] = useState<Resume[] | null>(null);
  const [resumeAId, setResumeAId] = useState("");
  const [resumeBId, setResumeBId] = useState("");
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [activeAName, setActiveAName] = useState("");
  const [activeBName, setActiveBName] = useState("");
  const [pastComparisons, setPastComparisons] = useState<ComparisonListItem[]>([]);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    api.resumes.list()
      .then((list) => {
        setResumes(list);
        const proc = list.filter((r) => r.status === "PROCESSED");
        if (proc.length >= 1) setResumeAId(proc[0].id);
        if (proc.length >= 2) setResumeBId(proc[1].id);
      })
      .catch(() => setResumes([]))
      .finally(() => setPageLoading(false));
  }, []);

  const loadPastComparisons = useCallback(async () => {
    try {
      const res = await api.comparisons.list();
      setPastComparisons(res.rows ?? []);
    } catch {
      setPastComparisons([]);
    }
  }, []);

  useEffect(() => { loadPastComparisons(); }, [loadPastComparisons]);

  const compare = async () => {
    if (!resumeAId || !resumeBId || resumeAId === resumeBId) return;
    setComparing(true);
    setError("");
    setResult(null);
    try {
      const res = await api.comparisons.compare(resumeAId, resumeBId);
      const processed = (resumes ?? []).filter((r) => r.status === "PROCESSED");
      setActiveAName(processed.find((r) => r.id === resumeAId)?.title || processed.find((r) => r.id === resumeAId)?.originalFileName || "Resume A");
      setActiveBName(processed.find((r) => r.id === resumeBId)?.title || processed.find((r) => r.id === resumeBId)?.originalFileName || "Resume B");
      setResult(res);
      loadPastComparisons();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Comparison failed. Please try again.");
    } finally {
      setComparing(false);
    }
  };

  const openPast = async (id: string) => {
    setComparing(true);
    setError("");
    try {
      const res = await api.comparisons.get(id);
      setResult(res);
      setActiveAName("");
      setActiveBName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load comparison.");
    } finally {
      setComparing(false);
    }
  };

  if (pageLoading) {
    return (
      <AppLayout>
        <div className="p-6 max-w-5xl mx-auto">
          <div className="skeleton h-7 w-40 mb-2 rounded" />
          <div className="skeleton h-4 w-64 mb-6 rounded" />
          <div className="skeleton h-44 w-full rounded-xl mb-4" />
        </div>
      </AppLayout>
    );
  }

  const processed = (resumes ?? []).filter((r) => r.status === "PROCESSED");

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto page-in">
        <div className="mb-6">
          <h1 className="page-title mb-1">Resume Comparison</h1>
          <p className="caption">Compare two resumes side-by-side to see what changed and which is stronger.</p>
        </div>

        {processed.length === 0 ? (
          <EmptyState reason="no-resumes" />
        ) : processed.length < 2 ? (
          <EmptyState reason="need-two" />
        ) : (
          <>
            {/* Controls */}
            <div className="card p-5 mb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="section-label block mb-2">Resume A (before)</label>
                  <select
                    value={resumeAId}
                    onChange={(e) => setResumeAId(e.target.value)}
                    className="input w-full"
                    style={{ height: "36px", fontSize: "13px" }}
                  >
                    {processed.map((r) => (
                      <option key={r.id} value={r.id}>{r.title || r.originalFileName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="section-label block mb-2">Resume B (after)</label>
                  <select
                    value={resumeBId}
                    onChange={(e) => setResumeBId(e.target.value)}
                    className="input w-full"
                    style={{ height: "36px", fontSize: "13px" }}
                  >
                    {processed.map((r) => (
                      <option key={r.id} value={r.id}>{r.title || r.originalFileName}</option>
                    ))}
                  </select>
                </div>
              </div>

              {resumeAId === resumeBId && resumeAId && (
                <p style={{ fontSize: "12px", color: "var(--warning)", marginBottom: "12px" }}>
                  Select two different resumes to compare.
                </p>
              )}

              <div className="flex items-center justify-end">
                <button
                  className="btn btn-primary"
                  style={{ height: "36px", fontSize: "13px", paddingInline: "20px" }}
                  onClick={compare}
                  disabled={comparing || !resumeAId || !resumeBId || resumeAId === resumeBId}
                >
                  {comparing ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Comparing...</>
                  ) : (
                    <><GitCompare className="w-3.5 h-3.5" /> Compare Resumes</>
                  )}
                </button>
              </div>

              {error && (
                <div className="mt-3 rounded-md px-3 py-2.5" style={{ background: "var(--danger-dim)", border: "1px solid var(--danger-border)" }}>
                  <p style={{ fontSize: "13px", color: "var(--danger)" }}>{error}</p>
                </div>
              )}
            </div>

            {/* Past comparisons */}
            {!result && pastComparisons.length > 0 && (
              <div className="card overflow-hidden mb-4">
                <div className="px-5 py-3.5" style={{ borderBottom: "1px solid var(--border)" }}>
                  <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-1)" }}>Previous Comparisons</h2>
                </div>
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      {["Resume A", "Resume B", "Score Change", "Date"].map((h) => (
                        <th key={h} className="text-left px-4 py-2.5" style={{ fontSize: "11px", color: "var(--ink-3)", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pastComparisons.map((item) => (
                      <PastRow key={item.comparisonId} item={item} onClick={() => openPast(item.comparisonId)} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Loading */}
            {comparing && !result && (
              <div className="flex items-center justify-center py-16">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--accent)" }} />
                  <p style={{ fontSize: "13px", color: "var(--ink-2)" }}>Running comparison engine...</p>
                </div>
              </div>
            )}

            {/* Result */}
            {result && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p style={{ fontSize: "13px", color: "var(--ink-2)" }}>
                    {formatDate(result.createdAt)}
                  </p>
                  <button
                    className="btn btn-ghost"
                    style={{ height: "28px", fontSize: "11px" }}
                    onClick={() => setResult(null)}
                  >
                    {pastComparisons.length > 0 ? "History" : "Close"}
                  </button>
                </div>
                <ComparisonDisplay
                  result={result}
                  resumeAName={activeAName}
                  resumeBName={activeBName}
                />
              </>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
