"use client";

import AppLayout from "@/components/layout/AppLayout";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { api, type Resume } from "@/lib/api-client";
import {
  Upload,
  BarChart2,
  Briefcase,
  Eye,
  Sparkles,
  ArrowRight,
  FileText,
  CheckCircle,
  AlertCircle,
  Loader2,
  Clock,
} from "lucide-react";

// ── Feature descriptions for the empty state ──────────────────────────────────

const FEATURES = [
  {
    icon: BarChart2,
    title: "ATS Analysis",
    description:
      "Get an ATS score, keyword coverage, formatting feedback, and actionable improvements.",
  },
  {
    icon: Sparkles,
    title: "AI Resume Review",
    description:
      "Receive AI-powered suggestions to strengthen every section of your resume.",
  },
  {
    icon: Briefcase,
    title: "Job Matching",
    description:
      "Compare your resume against job descriptions and discover missing skills.",
  },
  {
    icon: Eye,
    title: "Recruiter View",
    description:
      "See how recruiters and hiring managers will evaluate your resume.",
  },
] as const;

function timeGreeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

// ── Empty-state dashboard ─────────────────────────────────────────────────────

function EmptyDashboard({ firstName }: { firstName: string }) {
  return (
    <div className="p-6 max-w-3xl mx-auto page-in">
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="page-title mb-1">
          {timeGreeting()}, {firstName}.
        </h1>
        <p className="caption">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      </div>

      {/* Hero CTA card */}
      <div
        className="card p-10 mb-4 text-center"
        style={{ borderRadius: "12px" }}
      >
        {/* Icon */}
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-6"
          style={{
            background: "var(--accent-dim)",
            border: "1px solid var(--accent-border)",
          }}
        >
          <Upload className="w-6 h-6" style={{ color: "var(--accent)" }} />
        </div>

        <h2
          className="mb-3"
          style={{
            fontSize: "22px",
            fontWeight: 700,
            letterSpacing: "-0.03em",
            color: "var(--ink-1)",
          }}
        >
          Welcome to Resumora
        </h2>

        <p
          className="mx-auto mb-8"
          style={{
            fontSize: "14px",
            color: "var(--ink-2)",
            lineHeight: 1.7,
            maxWidth: "440px",
          }}
        >
          Upload your first resume to unlock AI-powered ATS analysis, recruiter
          insights, resume scoring, and job matching.
        </p>

        <Link href="/upload">
          <button
            className="btn btn-primary"
            style={{
              paddingInline: "24px",
              height: "40px",
              fontSize: "14px",
              borderRadius: "8px",
              gap: "8px",
            }}
          >
            <Upload className="w-4 h-4" />
            Upload Your First Resume
          </button>
        </Link>
      </div>

      {/* Feature info cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {FEATURES.map(({ icon: Icon, title, description }, i) => (
          <div
            key={title}
            className="card p-4"
            style={{
              animationDelay: `${i * 60}ms`,
              transition: "border-color 0.2s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor =
                "var(--border-strong)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor =
                "var(--border)";
            }}
          >
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center mb-3"
              style={{ background: "var(--surface-3)" }}
            >
              <Icon className="w-3.5 h-3.5" style={{ color: "var(--ink-2)" }} />
            </div>
            <p
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--ink-1)",
                marginBottom: "6px",
              }}
            >
              {title}
            </p>
            <p style={{ fontSize: "12px", color: "var(--ink-3)", lineHeight: 1.6 }}>
              {description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Status badge for resume rows ──────────────────────────────────────────────

function StatusBadge({ status }: { status: Resume["status"] }) {
  switch (status) {
    case "PROCESSED":
      return (
        <span className="badge badge-success">
          <CheckCircle
            className="w-3 h-3"
            style={{ display: "inline", marginRight: "4px", verticalAlign: "middle" }}
          />
          Processed
        </span>
      );
    case "PROCESSING":
      return (
        <span className="badge badge-blue">
          <Loader2
            className="w-3 h-3 animate-spin"
            style={{ display: "inline", marginRight: "4px", verticalAlign: "middle" }}
          />
          Processing
        </span>
      );
    case "PENDING":
      return (
        <span className="badge badge-neutral">
          <Clock
            className="w-3 h-3"
            style={{ display: "inline", marginRight: "4px", verticalAlign: "middle" }}
          />
          Pending
        </span>
      );
    default:
      return (
        <span className="badge badge-danger">
          <AlertCircle
            className="w-3 h-3"
            style={{ display: "inline", marginRight: "4px", verticalAlign: "middle" }}
          />
          Failed
        </span>
      );
  }
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
  };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-US", opts);
}

// ── Real dashboard (user has at least one resume) ─────────────────────────────

function RealDashboard({
  resumes,
  firstName,
}: {
  resumes: Resume[];
  firstName: string;
}) {
  const processedCount = resumes.filter((r) => r.status === "PROCESSED").length;
  const pendingCount = resumes.filter(
    (r) => r.status === "PENDING" || r.status === "PROCESSING"
  ).length;

  return (
    <div className="p-6 max-w-6xl mx-auto page-in">
      {/* Header */}
      <div className="mb-7 flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title mb-1">
            {timeGreeting()}, {firstName}.
          </h1>
          <p className="caption">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
        <Link href="/upload" className="flex-shrink-0">
          <button className="btn btn-secondary" style={{ gap: "6px" }}>
            <Upload className="w-3.5 h-3.5" />
            Upload Resume
          </button>
        </Link>
      </div>

      {/* Stats row — only real data */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="card p-5">
          <p className="section-label mb-3">Total Resumes</p>
          <span
            className="font-bold"
            style={{
              fontSize: "28px",
              color: "var(--ink-1)",
              letterSpacing: "-0.04em",
              lineHeight: 1,
            }}
          >
            {resumes.length}
          </span>
        </div>

        <div className="card p-5">
          <p className="section-label mb-3">Processed</p>
          <span
            className="font-bold"
            style={{
              fontSize: "28px",
              color: "var(--ink-1)",
              letterSpacing: "-0.04em",
              lineHeight: 1,
            }}
          >
            {processedCount}
          </span>
          {pendingCount > 0 && (
            <p className="caption mt-1">
              {pendingCount} in queue
            </p>
          )}
        </div>

        {/* Prompt cards for features not yet used */}
        <div className="card p-5">
          <p className="section-label mb-2">ATS Score</p>
          <p className="caption" style={{ lineHeight: 1.6 }}>
            <Link href="/analysis" style={{ color: "var(--accent)" }}>
              Run an ATS analysis
            </Link>{" "}
            to see how your resume scores.
          </p>
        </div>

        <div className="card p-5">
          <p className="section-label mb-2">Best Job Match</p>
          <p className="caption" style={{ lineHeight: 1.6 }}>
            <Link href="/job-matching" style={{ color: "var(--accent)" }}>
              Try job matching
            </Link>{" "}
            to see your fit against a JD.
          </p>
        </div>
      </div>

      {/* Resume table */}
      <div className="card overflow-hidden mb-4">
        <div
          className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h2
            style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-1)" }}
          >
            Your Resumes
          </h2>
          <Link href="/resumes">
            <span
              className="flex items-center gap-1"
              style={{ fontSize: "11px", color: "var(--accent)" }}
            >
              View all <ArrowRight className="w-3 h-3" />
            </span>
          </Link>
        </div>

        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Resume", "Status", "Size", "Uploaded"].map((h) => (
                <th
                  key={h}
                  className="text-left px-5 py-2.5"
                  style={{
                    fontSize: "11px",
                    color: "var(--ink-3)",
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resumes.slice(0, 6).map((resume) => (
              <tr
                key={resume.id}
                style={{ borderBottom: "1px solid var(--border)" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    "var(--surface-2)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "";
                }}
              >
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <FileText
                      className="w-3.5 h-3.5 flex-shrink-0"
                      style={{ color: "var(--ink-3)" }}
                    />
                    <div className="min-w-0">
                      <p
                        style={{ fontSize: "13px", color: "var(--ink-1)" }}
                        className="truncate"
                      >
                        {resume.title}
                      </p>
                      {resume.title !== resume.originalFileName && (
                        <p
                          style={{ fontSize: "11px", color: "var(--ink-3)" }}
                          className="truncate"
                        >
                          {resume.originalFileName}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <StatusBadge status={resume.status} />
                </td>
                <td className="px-5 py-3">
                  <span style={{ fontSize: "12px", color: "var(--ink-3)" }}>
                    {formatFileSize(resume.fileSize)}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <span style={{ fontSize: "12px", color: "var(--ink-3)" }}>
                    {formatDate(resume.createdAt)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Next-step prompt cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          {
            href: "/analysis",
            icon: BarChart2,
            title: "Run ATS Analysis",
            desc: "Score your resume and get keyword-level feedback.",
          },
          {
            href: "/job-matching",
            icon: Briefcase,
            title: "Match a Job",
            desc: "Paste a job description and see how well you fit.",
          },
          {
            href: "/recruiter",
            icon: Eye,
            title: "Recruiter View",
            desc: "See your resume from a recruiter's perspective.",
          },
        ].map(({ href, icon: Icon, title, desc }) => (
          <Link href={href} key={href} className="block">
            <div
              className="card p-4 flex items-start gap-3"
              style={{ transition: "border-color 0.2s", minHeight: "72px" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor =
                  "var(--accent-border)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor =
                  "var(--border)";
              }}
            >
              <div
                className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{
                  background: "var(--accent-dim)",
                  border: "1px solid var(--accent-border)",
                }}
              >
                <Icon
                  className="w-3.5 h-3.5"
                  style={{ color: "var(--accent)" }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "var(--ink-1)",
                    marginBottom: "2px",
                  }}
                >
                  {title}
                </p>
                <p style={{ fontSize: "12px", color: "var(--ink-3)", lineHeight: 1.5 }}>
                  {desc}
                </p>
              </div>
              <ArrowRight
                className="w-3.5 h-3.5 self-center flex-shrink-0"
                style={{ color: "var(--ink-3)" }}
              />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-7">
        <div className="skeleton h-5 w-52 rounded mb-2" />
        <div className="skeleton h-3 w-36 rounded" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-5">
            <div className="skeleton h-2.5 w-20 rounded mb-4" />
            <div className="skeleton h-7 w-12 rounded" />
          </div>
        ))}
      </div>
      <div className="card overflow-hidden mb-4">
        <div
          className="px-5 py-3.5"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="skeleton h-3 w-28 rounded" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-5 py-3"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <div className="skeleton h-3.5 w-3.5 rounded flex-shrink-0" />
            <div className="skeleton h-3 flex-1 rounded" />
            <div className="skeleton h-3 w-16 rounded" />
            <div className="skeleton h-3 w-12 rounded" />
            <div className="skeleton h-3 w-14 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page entry point ──────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();
  const [resumes, setResumes] = useState<Resume[] | null>(null);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.resumes
      .list()
      .then((data) => {
        if (active) {
          setResumes(data);
          setFetching(false);
        }
      })
      .catch((err) => {
        if (active) {
          setFetchError((err as Error).message);
          setFetching(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // Sync with History page: when a resume is deleted there, remove it here too
  // so the dashboard stays consistent without a full page reload.
  useEffect(() => {
    const onDeleted = (e: Event) => {
      const { id } = (e as CustomEvent<{ id: string }>).detail;
      setResumes((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
    };
    window.addEventListener("resumora:resume-deleted", onDeleted);
    return () => window.removeEventListener("resumora:resume-deleted", onDeleted);
  }, []);

  const firstName = user?.firstName ?? "there";

  return (
    <AppLayout>
      {fetching && <DashboardSkeleton />}

      {fetchError && !fetching && (
        <div className="p-6 max-w-4xl mx-auto page-in">
          <div
            className="card p-5"
            style={{
              borderColor: "var(--danger-border)",
              background: "var(--danger-dim)",
            }}
          >
            <p style={{ fontSize: "13px", color: "var(--danger)" }}>
              Could not load dashboard: {fetchError}
            </p>
          </div>
        </div>
      )}

      {!fetching && !fetchError && resumes !== null && (
        resumes.length === 0 ? (
          <EmptyDashboard firstName={firstName} />
        ) : (
          <RealDashboard resumes={resumes} firstName={firstName} />
        )
      )}
    </AppLayout>
  );
}
