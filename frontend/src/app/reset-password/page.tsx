"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const [missingToken] = useState(!token);

  useEffect(() => {
    if (success) {
      const t = setTimeout(() => router.push("/login"), 3000);
      return () => clearTimeout(t);
    }
  }, [success, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await api.auth.resetPassword(token, password);
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setError("This reset link is invalid or has expired. Please request a new one.");
      } else if (err instanceof ApiError && err.status === 0) {
        setError("Unable to reach the server. Make sure the backend is running.");
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

        {missingToken ? (
          <>
            <h1 className="page-title mb-2">Invalid link</h1>
            <p className="caption mb-6">
              This reset link is missing a token. Please use the link from your email.
            </p>
            <Link href="/forgot-password">
              <button className="btn btn-primary w-full" style={{ height: "36px" }}>
                Request new link
              </button>
            </Link>
          </>
        ) : success ? (
          <>
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center mb-4"
              style={{ background: "var(--success-dim)", border: "1px solid var(--success-border)" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--success)" }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1 className="page-title mb-2">Password updated</h1>
            <p className="caption mb-6">
              Your password has been changed successfully. Redirecting you to sign in…
            </p>
            <Link href="/login">
              <button className="btn btn-primary w-full" style={{ height: "36px" }}>
                Sign in now
              </button>
            </Link>
          </>
        ) : (
          <>
            <h1 className="page-title mb-1">Reset password</h1>
            <p className="caption mb-6">Enter your new password below.</p>

            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="section-label block mb-1.5" htmlFor="password">
                  New password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input w-full"
                    style={{ height: "36px", paddingLeft: "12px", paddingRight: "36px" }}
                    placeholder="Min 8 characters"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 flex items-center pr-2.5"
                    style={{ color: "var(--ink-3)" }}
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="section-label block mb-1.5" htmlFor="confirm">
                  Confirm password
                </label>
                <div className="relative">
                  <input
                    id="confirm"
                    type={showConfirm ? "text" : "password"}
                    required
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="input w-full"
                    style={{
                      height: "36px",
                      paddingLeft: "12px",
                      paddingRight: "36px",
                      borderColor: confirm && confirm !== password ? "var(--danger)" : undefined,
                    }}
                    placeholder="Repeat password"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    tabIndex={-1}
                    aria-label={showConfirm ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 flex items-center pr-2.5"
                    style={{ color: "var(--ink-3)" }}
                  >
                    {showConfirm ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {error && (
                <div
                  className="px-3 py-2.5 rounded-md"
                  style={{
                    fontSize: "12px",
                    color: "var(--danger)",
                    background: "var(--danger-dim)",
                    border: "1px solid var(--danger-border)",
                    lineHeight: "1.5",
                  }}
                >
                  {error}
                  {error.includes("expired") && (
                    <>
                      {" "}
                      <Link href="/forgot-password" style={{ color: "var(--accent)", textDecoration: "underline" }}>
                        Request a new link
                      </Link>
                    </>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-full"
                style={{ height: "36px", marginTop: "4px", opacity: loading ? 0.7 : 1 }}
              >
                {loading ? "Updating…" : "Update password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen" style={{ background: "var(--surface-0)" }}>
        <div className="caption">Loading…</div>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
