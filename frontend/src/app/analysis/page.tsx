"use client";

import { useState, useEffect, useCallback } from "react";
import AppLayout from "@/components/layout/AppLayout";
import {
  CheckCircle,
  AlertTriangle,
  Loader2,
  FileText,
  RefreshCw,
  ChevronDown,
  Download,
} from "lucide-react";
import {
  api,
  type Resume,
  type AtsAnalysisResult,
  type AtsAnalysisSummary,
} from "@/lib/api-client";
import { getScoreColor, getScoreLabel, formatDate, formatRelative } from "@/lib/utils";
import { exportAtsPdf } from "@/lib/export-pdf";

// ── Score ring ────────────────────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const r = 56;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const color = getScoreColor(score);

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="140" height="140" style={{ transform: "rotate(-90deg)" }} viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--surface-4)" strokeWidth={6} />
        <circle
          cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth={6}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span style={{ fontSize: "36px", fontWeight: 800, letterSpacing: "-0.04em", color, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {score}
        </span>
        <span style={{ fontSize: "11px", color: "var(--ink-3)", marginTop: "2px" }}>out of 100</span>
      </div>
    </div>
  );
}

function CategoryBar({ label, score }: { label: string; score: number }) {
  const color = getScoreColor(score);
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span style={{ fontSize: "13px", color: "var(--ink-2)" }}>{label}</span>
        <span style={{ fontSize: "13px", fontWeight: 600, color, fontVariantNumeric: "tabular-nums" }}>{score}</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${score}%`, background: color }} />
      </div>
    </div>
  );
}

function KeywordChip({ word, found }: { word: string; found: boolean }) {
  return (
    <span
      className="badge"
      style={{
        background: found ? "var(--success-dim)" : "var(--surface-3)",
        color: found ? "var(--success)" : "var(--ink-3)",
        borderColor: found ? "var(--success-border)" : "var(--border)",
        fontSize: "11px",
      }}
    >
      {word}
    </span>
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
        <FileText className="w-6 h-6" style={{ color: "var(--accent)" }} />
      </div>
      <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--ink-1)", marginBottom: "8px" }}>
        No processed resumes
      </h2>
      <p className="caption mb-4">Upload a resume and wait for processing to complete.</p>
      <a href="/upload" className="btn btn-primary" style={{ height: "34px", fontSize: "12px", paddingInline: "16px" }}>
        Upload Resume
      </a>
    </div>
  );
}

// ── Past analysis item ────────────────────────────────────────────────────────
function PastItem({ item, onClick }: { item: AtsAnalysisSummary; onClick: () => void }) {
  const color = getScoreColor(item.overallScore);
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
          <span style={{ fontSize: "14px", fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
            {item.overallScore}
          </span>
          <span style={{ fontSize: "11px", color: "var(--ink-3)" }}>/ 100 · {item.grade}</span>
        </div>
        <p style={{ fontSize: "11px", color: "var(--ink-3)" }}>{formatRelative(item.createdAt)}</p>
      </div>
      <span className={`badge ${decisionCls}`} style={{ fontSize: "10px", flexShrink: 0 }}>
        {item.recruiterDecision}
      </span>
    </button>
  );
}

// ── Result display ────────────────────────────────────────────────────────────
function AnalysisDisplay({ data, resumeName }: { data: AtsAnalysisResult; resumeName: string }) {
  const components = data.components ?? [];

  const matchedKeywords: string[] = [];
  const missingKeywords: string[] = [];
  for (const comp of components) {
    const ev = (comp as unknown as { evidence?: { type: string; value: string; polarity: string }[] }).evidence ?? [];
    for (const e of ev) {
      if (e.type === "matched_skill" && e.polarity === "positive" && !matchedKeywords.includes(e.value)) {
        matchedKeywords.push(e.value);
      }
      if (e.type === "missing_skill" && e.polarity === "negative" && !missingKeywords.includes(e.value)) {
        missingKeywords.push(e.value);
      }
    }
  }

  const decisionCls =
    data.overallScore >= 80 ? "badge-success" : data.overallScore >= 60 ? "badge-warning" : "badge-danger";

  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportAtsPdf(data, resumeName);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="card p-6 flex flex-col items-center justify-center gap-4">
          <ScoreRing score={data.overallScore} />
          <div className="text-center">
            <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-1)" }}>
              {getScoreLabel(data.overallScore)} Resume
            </p>
            <div className="mt-2">
              <span className={`badge ${decisionCls}`}>{data.recruiter.decision}</span>
            </div>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="btn btn-ghost mt-1"
              style={{ height: "30px", fontSize: "11px", paddingInline: "12px" }}
            >
              {exporting ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
              ) : (
                <Download className="w-3 h-3 mr-1.5" />
              )}
              {exporting ? "Exporting…" : "Export PDF"}
            </button>
          </div>
        </div>

        <div className="lg:col-span-2 card p-5">
          <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-1)", marginBottom: "16px" }}>
            Score Breakdown
          </h2>
          <div className="space-y-4">
            {components.map((c) => (
              <CategoryBar key={c.component} label={c.name} score={c.raw_score} />
            ))}
          </div>
        </div>
      </div>

      {data.summary && (
        <div className="card p-5 mb-4">
          <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-1)", marginBottom: "8px" }}>Summary</h2>
          <p style={{ fontSize: "13px", color: "var(--ink-2)", lineHeight: "1.7" }}>{data.summary}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: "var(--success)" }} />
            <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-1)" }}>Strengths</h2>
          </div>
          <div className="space-y-2.5">
            {(data.strengths ?? []).length === 0
              ? <p style={{ fontSize: "13px", color: "var(--ink-3)" }}>None identified.</p>
              : (data.strengths ?? []).map((item, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" style={{ background: "var(--success)" }} />
                  <p style={{ fontSize: "13px", color: "var(--ink-2)", lineHeight: "1.5" }}>{item}</p>
                </div>
              ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: "var(--warning)" }} />
            <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-1)" }}>Areas to Improve</h2>
          </div>
          <div className="space-y-2.5">
            {(data.improvementAreas ?? []).length === 0
              ? <p style={{ fontSize: "13px", color: "var(--ink-3)" }}>None flagged.</p>
              : (data.improvementAreas ?? []).map((item, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" style={{ background: "var(--warning)" }} />
                  <p style={{ fontSize: "13px", color: "var(--ink-2)", lineHeight: "1.5" }}>{item}</p>
                </div>
              ))}
          </div>
        </div>
      </div>

      {(matchedKeywords.length > 0 || missingKeywords.length > 0) && (
        <div className="card p-5 mb-4">
          <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-1)", marginBottom: "16px" }}>
            Keyword Coverage
          </h2>
          <div className="space-y-4">
            {matchedKeywords.length > 0 && (
              <div>
                <p className="section-label mb-2.5">Found in resume</p>
                <div className="flex flex-wrap gap-1.5">
                  {matchedKeywords.map((kw) => <KeywordChip key={kw} word={kw} found />)}
                </div>
              </div>
            )}
            {matchedKeywords.length > 0 && missingKeywords.length > 0 && <div className="divider" />}
            {missingKeywords.length > 0 && (
              <div>
                <p className="section-label mb-2.5">Missing from resume</p>
                <div className="flex flex-wrap gap-1.5">
                  {missingKeywords.map((kw) => <KeywordChip key={kw} word={kw} found={false} />)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {data.recruiter.recruiterNotes && (
        <div className="card p-5">
          <div className="flex items-start justify-between gap-4 mb-3">
            <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-1)" }}>Recruiter Simulation</h2>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: "20px", fontWeight: 800, color: getScoreColor(data.recruiter.shortlistProbability), fontVariantNumeric: "tabular-nums" }}>
                {data.recruiter.shortlistProbability}%
              </span>
              <span style={{ fontSize: "11px", color: "var(--ink-3)" }}>shortlist</span>
            </div>
          </div>
          <p style={{ fontSize: "13px", color: "var(--ink-2)", lineHeight: "1.7" }}>
            {data.recruiter.recruiterNotes}
          </p>
        </div>
      )}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AnalysisPage() {
  const [resumes, setResumes] = useState<Resume[] | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [jd, setJd] = useState("");
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState("");
  const [result, setResult] = useState<AtsAnalysisResult | null>(null);
  const [pastAnalyses, setPastAnalyses] = useState<AtsAnalysisSummary[]>([]);
  const [loadingPast, setLoadingPast] = useState(false);
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
    setLoadingPast(true);
    try {
      const list = await api.ats.listByResume(resumeId);
      setPastAnalyses(list);
    } catch {
      setPastAnalyses([]);
    } finally {
      setLoadingPast(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) {
      setResult(null);
      loadPast(selectedId);
    }
  }, [selectedId, loadPast]);

  const runAnalysis = async () => {
    if (!selectedId) return;
    setRunning(true);
    setRunError("");
    setResult(null);
    try {
      const res = await api.ats.analyze(selectedId, jd.trim() || undefined);
      setResult(res);
      loadPast(selectedId);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : "Analysis failed. Please try again.");
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
      setRunError(e instanceof Error ? e.message : "Failed to load analysis.");
    } finally {
      setRunning(false);
    }
  };

  if (pageLoading) {
    return (
      <AppLayout>
        <div className="p-6 max-w-5xl mx-auto">
          <div className="skeleton h-7 w-40 mb-2 rounded" />
          <div className="skeleton h-4 w-64 mb-6 rounded" />
          <div className="skeleton h-44 w-full rounded-xl mb-4" />
          <div className="skeleton h-60 w-full rounded-xl" />
        </div>
      </AppLayout>
    );
  }

  const processed = (resumes ?? []).filter((r) => r.status === "PROCESSED");
  const selectedResume = processed.find((r) => r.id === selectedId);

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto page-in">
        <div className="mb-6">
          <h1 className="page-title mb-1">ATS Analysis</h1>
          <p className="caption">Score your resume against any job description.</p>
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
                    onClick={runAnalysis}
                    disabled={running || !selectedId}
                  >
                    {running ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing...</>
                    ) : (
                      <><RefreshCw className="w-3.5 h-3.5" /> Run Analysis</>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="section-label block mb-2" htmlFor="jd-ats">
                  Job Description{" "}
                  <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>(optional — improves accuracy)</span>
                </label>
                <textarea
                  id="jd-ats"
                  rows={4}
                  value={jd}
                  onChange={(e) => setJd(e.target.value)}
                  placeholder="Paste the job description here for a more targeted analysis..."
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

            {/* Past analyses list */}
            {!result && pastAnalyses.length > 0 && (
              <div className="card p-5 mb-4">
                <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-1)", marginBottom: "12px" }}>
                  Previous Analyses
                  {selectedResume && (
                    <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>
                      {" "}· {selectedResume.title || selectedResume.originalFileName}
                    </span>
                  )}
                </h2>
                {loadingPast ? (
                  <div className="skeleton h-10 w-full rounded-md" />
                ) : (
                  pastAnalyses.map((item) => (
                    <PastItem key={item.id} item={item} onClick={() => openPast(item.id)} />
                  ))
                )}
              </div>
            )}

            {/* Loading spinner while fetching past analysis */}
            {running && !result && (
              <div className="flex items-center justify-center py-16">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--accent)" }} />
                  <p style={{ fontSize: "13px", color: "var(--ink-2)" }}>Running ATS analysis...</p>
                </div>
              </div>
            )}

            {/* Result */}
            {result && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p style={{ fontSize: "13px", color: "var(--ink-2)" }}>
                    {selectedResume?.title || selectedResume?.originalFileName}
                    {" "}&middot;{" "}
                    {formatDate(result.createdAt)}
                  </p>
                  <button
                    className="btn btn-ghost"
                    style={{ height: "28px", fontSize: "11px" }}
                    onClick={() => setResult(null)}
                  >
                    <ChevronDown className="w-3 h-3" />
                    {pastAnalyses.length > 0 ? "History" : "Close"}
                  </button>
                </div>
                <AnalysisDisplay data={result} resumeName={selectedResume?.title || selectedResume?.originalFileName || "resume"} />
              </>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
