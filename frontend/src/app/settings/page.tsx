"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Trash2, AlertTriangle } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { useAuth } from "@/context/auth-context";
import { api, ApiError, clearAuth } from "@/lib/api-client";

export default function SettingsPage() {
  const { user } = useAuth();
  const router = useRouter();

  // ── Delete Account state ──────────────────────────────────────────────────────
  const [showDeleteSection, setShowDeleteSection] = useState(false);
  // Incremented every time the panel opens. Used as the form's `key` so React
  // fully unmounts and remounts the DOM inputs on each open — this gives the
  // browser brand-new input nodes with no autofill history attached to them.
  const [deleteSessionKey, setDeleteSessionKey] = useState(0);
  const [deletePassword, setDeletePassword] = useState("");
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Tracks whether the user has ever focused the password field this session.
  // The field renders as type="text" until first focus so Chrome's autofill
  // scanner (which runs on mount) never classifies it as a password field.
  const [deletePasswordFocused, setDeletePasswordFocused] = useState(false);

  const CONFIRM_PHRASE = "delete my account";
  const canDelete =
    deleteConfirmText.toLowerCase() === CONFIRM_PHRASE && deletePassword.length > 0;

  // Open the panel: always increment the key so the form gets new DOM nodes and
  // browser autofill has no cached association with them.
  const openDeleteSection = () => {
    setDeletePassword("");
    setDeleteConfirmText("");
    setDeleteError(null);
    setShowDeletePassword(false);
    setDeletePasswordFocused(false);
    setDeleteSessionKey((k) => k + 1);
    setShowDeleteSection(true);
  };

  const closeDeleteSection = () => {
    setShowDeleteSection(false);
    setDeletePassword("");
    setDeleteConfirmText("");
    setDeleteError(null);
    setShowDeletePassword(false);
    setDeletePasswordFocused(false);
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canDelete) return;

    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await api.auth.deleteAccount(deletePassword);
      clearAuth();
      router.push("/");
    } catch (err) {
      // Always clear the password after any failure — never retain it in state.
      setDeletePassword("");
      setShowDeletePassword(false);
      setDeletePasswordFocused(false);
      if (err instanceof ApiError && err.status === 401) {
        setDeleteError("Current password is incorrect. Please try again.");
      } else if (err instanceof ApiError && err.status === 0) {
        setDeleteError("Unable to reach the server. Make sure the backend is running.");
      } else {
        setDeleteError((err as Error).message ?? "Something went wrong. Please try again.");
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="page-title mb-1">Settings</h1>
        <p className="caption mb-8">Manage your account preferences.</p>

        {/* ── Account info ──────────────────────────────────────────────────── */}
        <section className="card p-6 mb-6">
          <h2 className="font-semibold text-sm mb-4" style={{ color: "var(--ink-1)" }}>
            Account
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="section-label">Name</span>
              <span style={{ fontSize: "13px", color: "var(--ink-2)" }}>
                {user ? `${user.firstName} ${user.lastName}` : "—"}
              </span>
            </div>
            <div className="divider" />
            <div className="flex items-center justify-between">
              <span className="section-label">Email</span>
              <span style={{ fontSize: "13px", color: "var(--ink-2)" }}>
                {user?.email ?? "—"}
              </span>
            </div>
          </div>
        </section>

        {/* ── Danger zone ───────────────────────────────────────────────────── */}
        <section
          className="card p-6"
          style={{ borderColor: showDeleteSection ? "var(--danger-border)" : undefined }}
        >
          <div className="flex items-start justify-between mb-1">
            <div>
              <h2
                className="font-semibold text-sm"
                style={{ color: showDeleteSection ? "var(--danger)" : "var(--ink-1)" }}
              >
                Delete Account
              </h2>
              <p className="caption mt-1">
                Permanently remove your account and all associated data. This cannot be undone.
              </p>
            </div>
            {!showDeleteSection && (
              <button
                onClick={openDeleteSection}
                className="btn flex items-center gap-1.5 flex-shrink-0"
                style={{
                  height: "32px",
                  fontSize: "12px",
                  background: "var(--danger-dim)",
                  border: "1px solid var(--danger-border)",
                  color: "var(--danger)",
                  paddingInline: "12px",
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete account
              </button>
            )}
          </div>

          {showDeleteSection && (
            /*
             * key={deleteSessionKey}: forces React to fully unmount + remount this
             * form tree on every open, giving the browser brand-new DOM nodes with
             * no autofill history.
             *
             * autoComplete="off": instructs the browser not to offer or fill
             * credentials for this form.
             */
            <form
              key={deleteSessionKey}
              onSubmit={handleDeleteAccount}
              className="mt-5 space-y-4"
              autoComplete="off"
            >
              {/*
               * Off-screen honeypot inputs.
               *
               * Some browsers (especially Chrome on older versions) ignore
               * autoComplete hints and fill the first password field they find.
               * Placing a visually-hidden username + current-password pair BEFORE
               * the real field gives those browsers a target to fill that the
               * user never sees. The real field below uses autoComplete="new-password"
               * so it is explicitly excluded from credential autofill.
               *
               * - Not display:none / visibility:hidden — browsers detect those and
               *   skip past them to find "real" fields.
               * - position:absolute + offscreen makes them invisible without hiding
               *   them from the browser's autofill heuristics.
               * - aria-hidden + tabIndex={-1} keeps them out of keyboard flow and
               *   screen-reader output.
               */}
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: "-99999px",
                  width: "1px",
                  height: "1px",
                  overflow: "hidden",
                  opacity: 0,
                  pointerEvents: "none",
                }}
              >
                <input
                  type="text"
                  name="honeypot-username"
                  tabIndex={-1}
                  autoComplete="username"
                />
                <input
                  type="password"
                  name="honeypot-current-password"
                  tabIndex={-1}
                  autoComplete="current-password"
                />
              </div>

              {/* Warning */}
              <div
                className="rounded-md px-3 py-3 flex gap-2.5"
                style={{
                  background: "var(--danger-dim)",
                  border: "1px solid var(--danger-border)",
                  fontSize: "12px",
                  color: "var(--danger)",
                  lineHeight: "1.6",
                }}
              >
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold mb-1">This action is permanent and irreversible.</p>
                  <p>
                    Your account, all uploaded resumes, analyses, job matches, comparisons, and
                    history will be permanently deleted. There is no recovery option.
                  </p>
                </div>
              </div>

              {/* Confirm phrase */}
              <div>
                <label className="section-label block mb-1.5">
                  Type{" "}
                  <strong style={{ color: "var(--ink-2)", fontFamily: "monospace" }}>
                    {CONFIRM_PHRASE}
                  </strong>{" "}
                  to confirm
                </label>
                <input
                  type="text"
                  required
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="input w-full"
                  style={{
                    height: "36px",
                    paddingInline: "12px",
                    borderColor:
                      deleteConfirmText && deleteConfirmText.toLowerCase() !== CONFIRM_PHRASE
                        ? "var(--danger)"
                        : undefined,
                  }}
                  placeholder={CONFIRM_PHRASE}
                  disabled={deleteLoading}
                  autoComplete="off"
                />
              </div>

              {/* Current password */}
              <div>
                <label className="section-label block mb-1.5">Current password</label>
                <div className="relative">
                  <input
                    /*
                     * Type-switch trick: before the user focuses, this is type="text"
                     * so Chrome's autofill scanner (which runs once on mount) never
                     * classifies the field as a password field and ignores it entirely.
                     * The moment the user clicks in, type flips to "password" (or stays
                     * "text" when the eye-toggle is active). This is the most reliable
                     * defence against Chrome ignoring all autoComplete hints.
                     *
                     * autoComplete="new-password": correct semantic value — signals that
                     * this is a confirmation/action field, not a login credential field.
                     * Browsers must NOT fill it with stored login credentials.
                     *
                     * name="delete_account_password": non-standard name with underscores —
                     * no password manager has credentials keyed to this field name.
                     *
                     * data-lpignore / data-1p-ignore: opt-out flags for LastPass and 1Password.
                     */
                    type={
                      !deletePasswordFocused
                        ? "text"
                        : showDeletePassword
                          ? "text"
                          : "password"
                    }
                    required
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    onFocus={() => setDeletePasswordFocused(true)}
                    className="input w-full"
                    style={{ height: "36px", paddingLeft: "12px", paddingRight: "36px" }}
                    placeholder="Enter your password"
                    disabled={deleteLoading}
                    autoComplete="new-password"
                    name="delete_account_password"
                    data-lpignore="true"
                    data-1p-ignore
                  />
                  <button
                    type="button"
                    onClick={() => setShowDeletePassword((v) => !v)}
                    tabIndex={-1}
                    className="absolute inset-y-0 right-0 flex items-center pr-2.5"
                    style={{ color: "var(--ink-3)" }}
                  >
                    {showDeletePassword ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Error */}
              {deleteError && (
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
                  {deleteError}
                </p>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeDeleteSection}
                  className="btn btn-secondary flex-1"
                  style={{ height: "36px", fontSize: "13px" }}
                  disabled={deleteLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!canDelete || deleteLoading}
                  className="btn flex-1"
                  style={{
                    height: "36px",
                    fontSize: "13px",
                    background: canDelete && !deleteLoading ? "var(--danger)" : "var(--danger-dim)",
                    color: canDelete && !deleteLoading ? "#fff" : "var(--danger)",
                    border: "1px solid var(--danger-border)",
                    opacity: deleteLoading ? 0.7 : 1,
                    cursor: !canDelete || deleteLoading ? "not-allowed" : "pointer",
                  }}
                >
                  {deleteLoading ? "Deleting…" : "Permanently delete account"}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
