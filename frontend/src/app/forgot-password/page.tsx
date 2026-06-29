"use client";

import { useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [devPreviewUrl, setDevPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await api.auth.forgotPassword(email);
      if (result.devPreviewUrl) {
        setDevPreviewUrl(result.devPreviewUrl);
      }
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        setError("Unable to reach the server. Make sure the backend is running.");
      } else if (err instanceof ApiError && err.status === 429) {
        setError("Too many requests. Please wait a few minutes and try again.");
      } else if (err instanceof ApiError && err.status >= 500) {
        setError(
          "The email could not be sent due to a server configuration issue. " +
          "Please check the server logs or contact the administrator."
        );
      } else {
        setError((err as Error).message ?? "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex items-center justify-center min-h-screen"
      style={{ background: "var(--surface-0)" }}
    >
      <div className="card p-8 w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
            style={{ background: "var(--accent)" }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 4h10M2 7h7M2 10h5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <span className="font-semibold text-sm" style={{ color: "var(--ink-1)", letterSpacing: "-0.01em" }}>
            Resumora
          </span>
        </div>

        {submitted ? (
          <>
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center mb-4"
              style={{ background: "var(--success-dim)", border: "1px solid var(--success-border)" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--success)" }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1 className="page-title mb-2">Check your email</h1>
            <p className="caption mb-4" style={{ lineHeight: "1.6" }}>
              If an account with that email exists, a password reset link has been sent.
              Check your inbox and spam folder.
            </p>

            {/* Dev-only helper: shown when Ethereal sandbox is used instead of real SMTP */}
            {devPreviewUrl && (
              <div
                className="rounded-lg px-4 py-3 mb-4"
                style={{
                  background: "rgba(234, 179, 8, 0.08)",
                  border: "1px solid rgba(234, 179, 8, 0.25)",
                  fontSize: "12px",
                  lineHeight: "1.6",
                  color: "var(--ink-2)",
                }}
              >
                <p style={{ fontWeight: 600, marginBottom: "6px", color: "#ca8a04" }}>
                  Development mode — Ethereal preview
                </p>
                <p style={{ marginBottom: "8px" }}>
                  No SMTP is configured, so the email was sent to a test sandbox.
                  It will NOT arrive in a real inbox. Open the preview to see the
                  styled email:
                </p>
                <a
                  href={devPreviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate"
                  style={{ color: "var(--accent)", textDecoration: "underline", wordBreak: "break-all" }}
                >
                  Open email preview
                </a>
                <p style={{ marginTop: "8px", color: "var(--ink-3)" }}>
                  Set <code style={{ fontFamily: "monospace" }}>SMTP_HOST</code>,{" "}
                  <code style={{ fontFamily: "monospace" }}>SMTP_USER</code>, and{" "}
                  <code style={{ fontFamily: "monospace" }}>SMTP_PASS</code> in{" "}
                  <code style={{ fontFamily: "monospace" }}>.env</code> to deliver real emails.
                </p>
              </div>
            )}

            {!devPreviewUrl && (
              <p className="caption mb-4" style={{ lineHeight: "1.6", color: "var(--ink-3)" }}>
                The link expires in 1 hour.
              </p>
            )}

            <Link href="/login">
              <button className="btn btn-secondary w-full" style={{ height: "36px" }}>
                Back to sign in
              </button>
            </Link>
          </>
        ) : (
          <>
            <h1 className="page-title mb-1">Forgot password?</h1>
            <p className="caption mb-6">
              Enter your email and we&apos;ll send you a reset link.
            </p>

            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="section-label block mb-1.5" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input w-full"
                  style={{ height: "36px", paddingInline: "12px" }}
                  placeholder="you@example.com"
                  disabled={loading}
                />
              </div>

              {error && (
                <p
                  className="px-3 py-2 rounded-md"
                  style={{
                    fontSize: "12px",
                    color: "var(--danger)",
                    background: "var(--danger-dim)",
                    border: "1px solid var(--danger-border)",
                    lineHeight: "1.5",
                  }}
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-full"
                style={{ height: "36px", marginTop: "4px", opacity: loading ? 0.7 : 1 }}
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>

            <p className="caption mt-6 text-center">
              Remember your password?{" "}
              <Link href="/login" style={{ color: "var(--accent)" }}>
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
