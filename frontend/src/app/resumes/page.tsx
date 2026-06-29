"use client";

import AppLayout from "@/components/layout/AppLayout";
import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Plus, Loader2 } from "lucide-react";
import { api, type Resume } from "@/lib/api-client";
import { getScoreColor, getScoreLabel, formatDate } from "@/lib/utils";

function ScoreRing({ score, size = 28 }: { score: number; size?: number }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-4)" strokeWidth={3} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={getScoreColor(score)}
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
      />
    </svg>
  );
}

function StatusBadge({ status }: { status: Resume["status"] }) {
  const map: Record<Resume["status"], string> = {
    PROCESSED: "badge-success",
    PROCESSING: "badge-warning",
    PENDING: "badge-warning",
    FAILED: "badge-danger",
  };
  return <span className={`badge ${map[status]}`}>{status}</span>;
}

export default function ResumesPage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.resumes
      .list()
      .then(setResumes)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  // Sync with History page: when a resume is deleted there, remove it here too.
  useEffect(() => {
    const onDeleted = (e: Event) => {
      const { id } = (e as CustomEvent<{ id: string }>).detail;
      setResumes((prev) => prev.filter((r) => r.id !== id));
    };
    window.addEventListener("resumora:resume-deleted", onDeleted);
    return () => window.removeEventListener("resumora:resume-deleted", onDeleted);
  }, []);

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto page-in">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="page-title mb-1">Resume Library</h1>
            <p className="caption">
              {loading ? "Loading…" : `${resumes.length} resume${resumes.length !== 1 ? "s" : ""} stored`}
            </p>
          </div>
          <Link href="/upload">
            <button
              className="btn btn-primary"
              style={{ height: "34px", fontSize: "12px", paddingInline: "14px" }}
            >
              <Plus className="w-3.5 h-3.5" />
              Upload new
            </button>
          </Link>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--ink-3)" }} />
          </div>
        )}

        {error && (
          <div
            className="rounded-lg px-4 py-3"
            style={{
              background: "var(--danger-dim)",
              border: "1px solid var(--danger-border)",
              fontSize: "13px",
              color: "var(--danger)",
            }}
          >
            {error}
          </div>
        )}

        {!loading && !error && resumes.length === 0 && (
          <div className="card py-16 text-center">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-3"
              style={{ background: "var(--surface-3)", border: "1px solid var(--border)" }}
            >
              <FileText className="w-5 h-5" style={{ color: "var(--ink-3)" }} />
            </div>
            <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink-1)", marginBottom: "6px" }}>
              No resumes yet
            </p>
            <p style={{ fontSize: "13px", color: "var(--ink-3)" }}>
              Upload your first resume to get started.
            </p>
            <Link href="/upload">
              <button className="btn btn-primary mt-4" style={{ height: "34px", fontSize: "12px" }}>
                <Plus className="w-3.5 h-3.5" />
                Upload resume
              </button>
            </Link>
          </div>
        )}

        {!loading && !error && resumes.length > 0 && (
          <div className="space-y-2">
            {resumes.map((resume) => {
              const meta = resume.metadata as Record<string, unknown> | null;
              const atsScore =
                typeof meta?.parserConfidence === "number"
                  ? Math.round(meta.parserConfidence * 100)
                  : null;

              return (
                <div
                  key={resume.id}
                  className="card px-5 py-4 flex items-center gap-4"
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                  }}
                >
                  {/* File icon */}
                  <div
                    className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0"
                    style={{ background: "var(--surface-3)", border: "1px solid var(--border)" }}
                  >
                    <FileText className="w-4 h-4" style={{ color: "var(--ink-2)" }} />
                  </div>

                  {/* Name + meta */}
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-1)", lineHeight: 1.3 }}>
                      {resume.title}
                    </p>
                    <p className="caption mt-0.5">
                      Uploaded {formatDate(resume.createdAt)}
                      {resume.originalFileName !== resume.title &&
                        ` · ${resume.originalFileName}`}
                    </p>
                  </div>

                  {/* Confidence score ring (if processed) */}
                  {atsScore !== null && resume.status === "PROCESSED" && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <ScoreRing score={atsScore} />
                      <div>
                        <div className="flex items-baseline gap-0.5">
                          <span
                            style={{
                              fontSize: "16px",
                              fontWeight: 700,
                              letterSpacing: "-0.03em",
                              color: getScoreColor(atsScore),
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {atsScore}
                          </span>
                          <span style={{ fontSize: "11px", color: "var(--ink-3)" }}>/100</span>
                        </div>
                        <p style={{ fontSize: "10px", color: "var(--ink-3)" }}>
                          {getScoreLabel(atsScore)}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Status */}
                  <StatusBadge status={resume.status} />

                  {/* Actions */}
                  <Link href="/upload">
                    <button
                      className="btn btn-ghost flex-shrink-0"
                      style={{ height: "28px", fontSize: "11px", paddingInline: "10px" }}
                    >
                      Re-upload
                    </button>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
