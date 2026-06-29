import Link from "next/link";
import {
  ArrowRight,
  BarChart2,
  Briefcase,
  Users,
  GitCompare,
  TrendingUp,
  FileText,
} from "lucide-react";

// ── Mini dashboard preview rendered in hero ────────────────────────────────
function DashboardPreview() {
  return (
    <div
      className="w-full rounded-xl overflow-hidden select-none"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        boxShadow: "0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)",
      }}
    >
      {/* Browser chrome */}
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#ff5f57" }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#febc2e" }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#28c840" }} />
        </div>
        <div
          className="flex-1 mx-6 h-5 rounded flex items-center justify-center"
          style={{ background: "var(--surface-3)", fontSize: "10px", color: "var(--ink-3)" }}
        >
          resumora.app/dashboard
        </div>
      </div>

      {/* App content */}
      <div className="flex" style={{ height: "300px" }}>
        {/* Sidebar */}
        <div
          className="w-36 flex-shrink-0 py-3 px-2 space-y-0.5"
          style={{ borderRight: "1px solid var(--border)", background: "var(--surface-1)" }}
        >
          <div
            className="px-2 mb-2"
            style={{ fontSize: "9px", color: "var(--ink-3)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}
          >
            Workspace
          </div>
          {[
            { label: "Dashboard", active: true },
            { label: "ATS Analysis" },
            { label: "Job Matching" },
            { label: "Recruiter Mode" },
          ].map(({ label, active }) => (
            <div
              key={label}
              className="flex items-center gap-1.5 px-2 py-1 rounded"
              style={{
                fontSize: "10px",
                background: active ? "rgba(255,255,255,0.08)" : "transparent",
                color: active ? "var(--ink-1)" : "var(--ink-3)",
              }}
            >
              <div
                className="w-1.5 h-1.5 rounded-sm flex-shrink-0"
                style={{ background: active ? "var(--accent)" : "var(--surface-4)" }}
              />
              {label}
            </div>
          ))}
        </div>

        {/* Main content */}
        <div className="flex-1 p-4 overflow-hidden">
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { label: "ATS Score", value: "87", color: "#3fb950" },
              { label: "Best Match", value: "92%", color: "#3fb950" },
              { label: "Readiness", value: "76%", color: "#d29922" },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                className="rounded-md p-2.5"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
              >
                <div style={{ fontSize: "8px", color: "var(--ink-3)", marginBottom: "4px" }}>{label}</div>
                <div style={{ fontSize: "16px", fontWeight: 700, color, letterSpacing: "-0.02em" }}>{value}</div>
              </div>
            ))}
          </div>

          <div
            className="rounded-md p-3 mb-3"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          >
            <div style={{ fontSize: "9px", color: "var(--ink-3)", marginBottom: "8px" }}>Score History</div>
            <svg width="100%" height="48" viewBox="0 0 200 48" preserveAspectRatio="none">
              <line x1="0" y1="16" x2="200" y2="16" stroke="var(--border)" strokeWidth="0.5" />
              <line x1="0" y1="32" x2="200" y2="32" stroke="var(--border)" strokeWidth="0.5" />
              <polyline points="0,38 40,30 80,26 120,18 160,14 200,8" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
              <polyline points="0,42 40,36 80,28 120,20 160,10 200,4" fill="none" stroke="#3fb950" strokeWidth="1.5" strokeDasharray="3,2" />
              <circle cx="200" cy="8" r="2.5" fill="var(--accent)" />
              <circle cx="200" cy="4" r="2.5" fill="#3fb950" />
            </svg>
          </div>

          <div className="space-y-1.5">
            {[
              { score: 87, color: "#3fb950" },
              { score: 74, color: "#d29922" },
              { score: 61, color: "#d29922" },
            ].map(({ score, color }, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: "var(--surface-4)" }} />
                <div className="flex-1 h-4 rounded" style={{ background: "var(--surface-3)" }} />
                <span style={{ fontSize: "9px", color, fontWeight: 600 }}>{score}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkflowStep({ n, title, desc, last }: { n: string; title: string; desc: string; last?: boolean }) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex flex-col items-center">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
          style={{
            border: "1px solid var(--border-strong)",
            color: "var(--ink-2)",
            background: "var(--surface-2)",
            fontSize: "11px",
            fontWeight: 600,
          }}
        >
          {n}
        </div>
        {!last && <div className="w-px mt-2" style={{ minHeight: "36px", background: "var(--border)" }} />}
      </div>
      <div className="pb-8">
        <div className="font-semibold mb-1" style={{ color: "var(--ink-1)", fontSize: "14px" }}>{title}</div>
        <p style={{ color: "var(--ink-2)", fontSize: "13px", lineHeight: "1.6" }}>{desc}</p>
      </div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) {
  return (
    <div
      className="p-5 rounded-lg"
      style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}
    >
      <div
        className="w-8 h-8 rounded-md flex items-center justify-center mb-3"
        style={{ background: "var(--surface-3)", border: "1px solid var(--border)" }}
      >
        <Icon className="w-4 h-4" style={{ color: "var(--ink-2)" }} strokeWidth={1.75} />
      </div>
      <h3 className="font-semibold mb-1.5" style={{ color: "var(--ink-1)", fontSize: "14px" }}>{title}</h3>
      <p style={{ color: "var(--ink-2)", fontSize: "13px", lineHeight: "1.6" }}>{desc}</p>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div style={{ background: "var(--surface-0)", color: "var(--ink-1)", minHeight: "100vh" }}>

      {/* Nav */}
      <nav
        className="sticky top-0 z-50 flex items-center justify-between px-6 md:px-12"
        style={{
          height: "56px",
          background: "rgba(10,10,10,0.92)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: "var(--accent)" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 4h10M2 7h7M2 10h5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <span className="font-semibold text-sm" style={{ letterSpacing: "-0.01em" }}>Resumora</span>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/login">
            <button className="btn btn-ghost" style={{ fontSize: "12px", height: "32px" }}>Sign in</button>
          </Link>
          <Link href="/register">
            <button className="btn btn-primary" style={{ fontSize: "12px", height: "32px", paddingInline: "12px" }}>
              Get started <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-25 pointer-events-none" />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(91,142,240,0.07) 0%, transparent 60%)" }}
        />

        <div className="relative max-w-4xl mx-auto px-6 md:px-12 pt-20 pb-16">
          <div className="flex justify-center mb-6">
            <span className="badge badge-blue" style={{ fontSize: "11px" }}>AI Resume Intelligence</span>
          </div>

          <h1
            className="text-center mb-5"
            style={{
              fontSize: "clamp(32px, 5vw, 52px)",
              fontWeight: 800,
              letterSpacing: "-0.04em",
              lineHeight: 1.08,
              color: "var(--ink-1)",
            }}
          >
            The professional
            <br />
            resume analysis platform.
          </h1>

          <p
            className="text-center mx-auto mb-8"
            style={{ fontSize: "15px", color: "var(--ink-2)", lineHeight: "1.7", maxWidth: "500px" }}
          >
            ATS scoring, job description matching, and recruiter simulation —
            designed for professionals who take their careers seriously.
          </p>

          <div className="flex items-center justify-center gap-3 mb-16">
            <Link href="/dashboard">
              <button className="btn btn-primary" style={{ height: "38px", paddingInline: "20px", fontSize: "13px" }}>
                Analyze your resume <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
            <Link href="/analysis">
              <button className="btn btn-secondary" style={{ height: "38px", paddingInline: "20px", fontSize: "13px" }}>
                View example report
              </button>
            </Link>
          </div>

          <DashboardPreview />
        </div>
      </section>

      {/* How it works */}
      <section className="py-20" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="max-w-4xl mx-auto px-6 md:px-12">
          <div className="grid md:grid-cols-2 gap-12 items-start">
            <div>
              <p className="section-label mb-3">How it works</p>
              <h2 style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.2, marginBottom: "16px" }}>
                From upload to optimization in minutes.
              </h2>
              <p style={{ color: "var(--ink-2)", fontSize: "14px", lineHeight: "1.7" }}>
                A structured workflow that surfaces exactly what matters — no noise, no vague feedback.
              </p>
            </div>

            <div>
              <WorkflowStep n="01" title="Upload your resume" desc="PDF or DOCX. Our parser extracts and structures every section with high accuracy." />
              <WorkflowStep n="02" title="Get your ATS score" desc="Multi-dimensional scoring across 6 criteria: skills, experience, education, keywords, formatting, and impact." />
              <WorkflowStep n="03" title="Match a job description" desc="Paste any JD. See exact overlap, missing keywords, and semantic alignment." />
              <WorkflowStep n="04" title="Run recruiter simulation" desc="Rule-based engine models the real 30-second recruiter review. Shortlist probability and red flags." />
              <WorkflowStep n="05" title="Optimize with precision" desc="Concrete, ranked recommendations. Track score improvement after every edit." last />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="max-w-4xl mx-auto px-6 md:px-12">
          <p className="section-label mb-3">Features</p>
          <h2 style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.2, marginBottom: "40px" }}>
            Everything you need. Nothing you don&apos;t.
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <FeatureCard icon={BarChart2} title="ATS Scoring" desc="Six-dimensional scoring model. Understand exactly how automated screening systems evaluate your resume." />
            <FeatureCard icon={Briefcase} title="JD Matching" desc="Paste any job description. Keyword overlap, missing skills, and semantic alignment in seconds." />
            <FeatureCard icon={Users} title="Recruiter Simulation" desc="Rule-based recruiter engine models real screening decisions. Shortlist probability and red flag detection." />
            <FeatureCard icon={GitCompare} title="Version Comparison" desc="Compare two resume versions side by side. See exactly what changed, improved, or regressed." />
            <FeatureCard icon={TrendingUp} title="Score History" desc="Track ATS score progression over time. Measure the impact of every edit with data." />
            <FeatureCard icon={FileText} title="Resume Library" desc="Store multiple resume versions. Maintain separate resumes for different roles and companies." />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="max-w-4xl mx-auto px-6 md:px-12 text-center">
          <h2 style={{ fontSize: "32px", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.2, marginBottom: "12px" }}>
            Ready to analyze your resume?
          </h2>
          <p style={{ color: "var(--ink-2)", fontSize: "14px", marginBottom: "28px" }}>
            No credit card required. Results in under 30 seconds.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link href="/dashboard">
              <button className="btn btn-primary" style={{ height: "40px", paddingInline: "24px", fontSize: "14px" }}>
                Get started free <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
            <Link href="/analysis">
              <button className="btn btn-secondary" style={{ height: "40px", paddingInline: "24px", fontSize: "14px" }}>
                View example
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="max-w-4xl mx-auto px-6 md:px-12">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: "var(--accent)" }}>
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                <path d="M2 4h10M2 7h7M2 10h5" stroke="#fff" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </div>
            <span style={{ fontSize: "13px", fontWeight: 600 }}>Resumora</span>
            <span style={{ fontSize: "12px", color: "var(--ink-3)", marginLeft: "8px" }}>&copy; 2026</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
