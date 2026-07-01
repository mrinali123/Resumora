"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Mail } from "lucide-react";
import { GoogleLogin } from "@react-oauth/google";
import { api, ApiError } from "@/lib/api-client";
import { useAuth } from "@/context/auth-context";

export default function RegisterPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [devPreviewUrl, setDevPreviewUrl] = useState<string | null>(null);

  const handleGoogleSuccess = async (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) return;
    setGoogleLoading(true);
    setError(null);
    try {
      const result = await api.auth.google(credentialResponse.credential);
      login(result.user, result.token);
      router.push("/dashboard");
    } catch (err) {
      setError((err as Error).message ?? "Google sign-up failed. Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const set =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((f) => ({ ...f, [key]: e.target.value }));
    };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsDuplicate(false);
    setLoading(true);
    try {
      const result = await api.auth.register(form);
      if (result.devPreviewUrl) setDevPreviewUrl(result.devPreviewUrl);
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setIsDuplicate(true);
        setError(
          "An account with this email already exists. Please sign in or use Forgot Password."
        );
      } else if (err instanceof ApiError && err.status === 422) {
        setError(err.message);
      } else if (err instanceof ApiError && err.status === 0) {
        setError("Unable to reach the server. Make sure the backend is running.");
      } else {
        setError((err as Error).message ?? "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Success state ────────────────────────────────────────────────────────────

  if (success) {
    return (
      <div
        className="flex items-center justify-center min-h-screen"
        style={{ background: "var(--surface-0)" }}
      >
        <div className="card p-8 w-full max-w-sm text-center">
          {/* Logo */}
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

          {/* Icon */}
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: "rgba(59,130,246,0.12)" }}
          >
            <Mail className="w-5 h-5" style={{ color: "var(--accent)" }} />
          </div>

          <h1 className="page-title mb-2">Check your email</h1>
          <p className="caption mb-1">
            Account created successfully. We sent a verification link to
          </p>
          <p className="mb-4" style={{ fontSize: "13px", color: "var(--ink-2)", fontWeight: 500 }}>
            {form.email}
          </p>
          <p className="caption mb-6">
            Click the link in that email to activate your account. The link expires in 24 hours.
          </p>

          {/* Dev helper: Ethereal preview */}
          {devPreviewUrl && (
            <div
              className="rounded-md p-3 mb-5 text-left"
              style={{
                background: "rgba(234,179,8,0.08)",
                border: "1px solid rgba(234,179,8,0.3)",
                fontSize: "12px",
                color: "#ca8a04",
                lineHeight: "1.6",
              }}
            >
              <strong>Dev mode</strong> — no SMTP configured. Email sent to Ethereal sandbox
              (your real inbox will not receive it).
              <br />
              <a
                href={devPreviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#ca8a04", textDecoration: "underline", wordBreak: "break-all" }}
              >
                Open Ethereal preview →
              </a>
            </div>
          )}

          <Link
            href="/login"
            className="btn btn-primary w-full flex items-center justify-center"
            style={{ height: "36px" }}
          >
            Go to sign in
          </Link>

          <p className="caption mt-4">
            Didn&apos;t receive the email?{" "}
            <Link href="/login" style={{ color: "var(--accent)" }}>
              Sign in to resend
            </Link>
          </p>
        </div>
      </div>
    );
  }

  // ── Registration form ────────────────────────────────────────────────────────

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

        <h1 className="page-title mb-1">Create account</h1>
        <p className="caption mb-6">Free to use. No credit card required.</p>

        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="section-label block mb-1.5">First name</label>
              <input
                required
                autoComplete="given-name"
                value={form.firstName}
                onChange={set("firstName")}
                className="input w-full"
                style={{ height: "36px", paddingInline: "12px" }}
                placeholder="First"
                disabled={loading}
              />
            </div>
            <div>
              <label className="section-label block mb-1.5">Last name</label>
              <input
                required
                autoComplete="family-name"
                value={form.lastName}
                onChange={set("lastName")}
                className="input w-full"
                style={{ height: "36px", paddingInline: "12px" }}
                placeholder="Last"
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <label className="section-label block mb-1.5">Email</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={form.email}
              onChange={set("email")}
              className="input w-full"
              style={{
                height: "36px",
                paddingInline: "12px",
                borderColor: isDuplicate ? "var(--danger)" : undefined,
              }}
              placeholder="you@example.com"
              disabled={loading}
            />
          </div>

          <div>
            <label className="section-label block mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
                value={form.password}
                onChange={set("password")}
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
              {isDuplicate && (
                <>
                  {" "}
                  <Link href="/login" style={{ color: "var(--danger)", textDecoration: "underline" }}>
                    Sign in
                  </Link>{" "}
                  or{" "}
                  <Link href="/forgot-password" style={{ color: "var(--danger)", textDecoration: "underline" }}>
                    Forgot Password
                  </Link>
                </>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || googleLoading}
            className="btn btn-primary w-full"
            style={{ height: "36px", marginTop: "4px", opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <div style={{ height: 1, flex: 1, background: "var(--border)" }} />
          <span className="caption">or</span>
          <div style={{ height: 1, flex: 1, background: "var(--border)" }} />
        </div>

        {/* Google sign-up */}
        <div className="flex justify-center" style={{ opacity: googleLoading ? 0.6 : 1, pointerEvents: googleLoading ? "none" : undefined }}>
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => setError("Google sign-up was cancelled or failed.")}
            theme="filled_black"
            shape="rectangular"
            size="large"
            width="320"
            text="continue_with"
          />
        </div>

        <p className="caption mt-6 text-center">
          Already have an account?{" "}
          <Link href="/login" style={{ color: "var(--accent)" }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
