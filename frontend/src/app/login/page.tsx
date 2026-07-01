"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Mail } from "lucide-react";
import { GoogleLogin } from "@react-oauth/google";
import { api, ApiError } from "@/lib/api-client";
import { useAuth } from "@/context/auth-context";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleSuccess = async (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) return;
    setGoogleLoading(true);
    setError(null);
    try {
      const result = await api.auth.google(credentialResponse.credential);
      login(result.user, result.token);
      router.push("/dashboard");
    } catch (err) {
      setError((err as Error).message ?? "Google sign-in failed. Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  };

  // Email-not-verified state
  const [unverified, setUnverified] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendDevPreviewUrl, setResendDevPreviewUrl] = useState<string | null>(null);

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setUnverified(false);
    setResendSuccess(false);
    setResendDevPreviewUrl(null);
    setLoading(true);
    try {
      const result = await api.auth.login(email, password);
      login(result.user, result.token);
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Invalid email or password. Please try again.");
      } else if (err instanceof ApiError && err.status === 403) {
        setUnverified(true);
        setError("Please verify your email before signing in.");
      } else if (err instanceof ApiError && err.status === 422) {
        setError(err.message);
      } else if (err instanceof ApiError && err.status === 429) {
        setError("Too many sign-in attempts. Please wait a few minutes and try again.");
      } else if (err instanceof ApiError && err.status === 0) {
        setError("Unable to reach the server. Make sure the backend is running.");
      } else {
        setError((err as Error).message ?? "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) return;
    setResendLoading(true);
    setResendSuccess(false);
    setResendDevPreviewUrl(null);
    try {
      const result = await api.auth.resendVerification(email);
      if (result.devPreviewUrl) setResendDevPreviewUrl(result.devPreviewUrl);
      setResendSuccess(true);
    } catch {
      // Silently swallow — the backend always returns 200 for resend
      setResendSuccess(true);
    } finally {
      setResendLoading(false);
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

        <h1 className="page-title mb-1">Sign in</h1>
        <p className="caption mb-6">Enter your credentials to continue.</p>

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
              onChange={handleEmailChange}
              className="input w-full"
              style={{ height: "36px", paddingInline: "12px" }}
              placeholder="you@example.com"
              disabled={loading}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="section-label" htmlFor="password">
                Password
              </label>
              <Link
                href="/forgot-password"
                style={{ fontSize: "11px", color: "var(--ink-3)" }}
                className="transition-colors hover:text-[var(--accent)]"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={handlePasswordChange}
                className="input w-full"
                style={{ height: "36px", paddingLeft: "12px", paddingRight: "36px" }}
                placeholder="••••••••"
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

          {/* Generic error */}
          {error && !unverified && (
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

          {/* Unverified email state */}
          {unverified && (
            <div
              className="rounded-md p-3"
              style={{
                background: "rgba(234,179,8,0.08)",
                border: "1px solid rgba(234,179,8,0.3)",
                fontSize: "12px",
                color: "#ca8a04",
                lineHeight: "1.6",
              }}
            >
              <div className="flex items-start gap-2 mb-2">
                <Mail className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>

              {resendSuccess ? (
                <p style={{ color: "#ca8a04" }}>
                  Verification email sent — check your inbox.
                  {resendDevPreviewUrl && (
                    <>
                      {" "}
                      <a
                        href={resendDevPreviewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#ca8a04", textDecoration: "underline" }}
                      >
                        Open Ethereal preview →
                      </a>
                    </>
                  )}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendLoading || !email}
                  style={{
                    color: "#ca8a04",
                    textDecoration: "underline",
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: resendLoading ? "default" : "pointer",
                    fontSize: "12px",
                    opacity: resendLoading ? 0.6 : 1,
                  }}
                >
                  {resendLoading ? "Sending…" : "Resend verification email"}
                </button>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || googleLoading}
            className="btn btn-primary w-full"
            style={{ height: "36px", marginTop: "4px", opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <div style={{ height: 1, flex: 1, background: "var(--border)" }} />
          <span className="caption">or</span>
          <div style={{ height: 1, flex: 1, background: "var(--border)" }} />
        </div>

        {/* Google sign-in */}
        <div className="flex justify-center" style={{ opacity: googleLoading ? 0.6 : 1, pointerEvents: googleLoading ? "none" : undefined }}>
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => setError("Google sign-in was cancelled or failed.")}
            theme="filled_black"
            shape="rectangular"
            size="large"
            width="320"
          />
        </div>

        <p className="caption mt-6 text-center">
          No account?{" "}
          <Link href="/register" style={{ color: "var(--accent)" }}>
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
