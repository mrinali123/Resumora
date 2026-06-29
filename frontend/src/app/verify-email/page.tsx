"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";

// ── Logo (shared across states) ────────────────────────────────────────────────

function Logo() {
  return (
    <div className="flex items-center justify-center gap-2.5 mb-8">
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
  );
}

// ── Inner component (needs useSearchParams → must be inside Suspense) ──────────

type Status = "loading" | "success" | "error";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Guard against React 18 Strict Mode's double useEffect invocation.
  // Without this, the first call succeeds (sets emailVerified=true) and the second
  // call sees the same token but the email is already verified — the backend
  // returns success (idempotent), but we avoid the unnecessary duplicate request.
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    if (!token) {
      setStatus("error");
      setErrorMessage(
        "No verification token found in the link. Please use the link from your email.",
      );
      return;
    }

    api.auth
      .verifyEmail(token)
      .then(() => setStatus("success"))
      .catch((err) => {
        setStatus("error");
        if (err instanceof ApiError) {
          setErrorMessage(err.message);
        } else {
          setErrorMessage("Something went wrong. Please request a new verification email.");
        }
      });
  }, [token]);

  return (
    <div
      className="flex items-center justify-center min-h-screen"
      style={{ background: "var(--surface-0)" }}
    >
      <div className="card p-8 w-full max-w-sm text-center">
        <Logo />

        {/* Loading */}
        {status === "loading" && (
          <>
            <div className="flex justify-center mb-4">
              <Loader2 className="w-10 h-10 animate-spin" style={{ color: "var(--accent)" }} />
            </div>
            <h1 className="page-title mb-2">Verifying your email…</h1>
            <p className="caption">This only takes a moment.</p>
          </>
        )}

        {/* Success */}
        {status === "success" && (
          <>
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: "rgba(34,197,94,0.12)" }}
            >
              <CheckCircle className="w-5 h-5" style={{ color: "#22c55e" }} />
            </div>
            <h1 className="page-title mb-2">Email verified</h1>
            <p className="caption mb-6">
              Email verified successfully. You can now sign in.
            </p>
            <Link
              href="/login"
              className="btn btn-primary w-full flex items-center justify-center"
              style={{ height: "36px" }}
            >
              Go to sign in
            </Link>
          </>
        )}

        {/* Error */}
        {status === "error" && (
          <>
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: "rgba(239,68,68,0.12)" }}
            >
              <XCircle className="w-5 h-5" style={{ color: "var(--danger)" }} />
            </div>
            <h1 className="page-title mb-2">Verification failed</h1>
            <p
              className="mb-4"
              style={{ fontSize: "13px", color: "var(--ink-3)", lineHeight: "1.6" }}
            >
              {errorMessage ?? "This link is invalid or has expired."}
            </p>
            <Link
              href="/login"
              className="btn btn-primary w-full flex items-center justify-center mb-3"
              style={{ height: "36px" }}
            >
              Go to sign in
            </Link>
            <p className="caption">
              On the sign in page, enter your email and click{" "}
              <strong style={{ color: "var(--ink-2)" }}>Resend verification email</strong>.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ── Suspense boundary required for useSearchParams in Next.js App Router ───────

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div
          className="flex items-center justify-center min-h-screen"
          style={{ background: "var(--surface-0)" }}
        >
          <div className="card p-8 w-full max-w-sm text-center">
            <Logo />
            <div className="flex justify-center mb-4">
              <Loader2 className="w-10 h-10 animate-spin" style={{ color: "var(--accent)" }} />
            </div>
            <h1 className="page-title mb-2">Loading…</h1>
          </div>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
