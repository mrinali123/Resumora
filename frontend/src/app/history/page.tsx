"use client";

import { useState, useEffect, useCallback } from "react";
import AppLayout from "@/components/layout/AppLayout";
import Link from "next/link";
import {
  FileText,
  Trash2,
  Clock,
  Loader2,
  CheckCircle,
  AlertCircle,
  Upload,
  X,
  RefreshCw,
} from "lucide-react";
import { api, type HistoryItem } from "@/lib/api-client";
import { getScoreColor, formatDate, formatBytes } from "@/lib/utils";

// ── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: HistoryItem["status"] }) {
  switch (status) {
    case "PROCESSED":
      return (
        <span className="badge badge-success">
          <CheckCircle className="w-3 h-3" style={{ display: "inline", marginRight: "3px", verticalAlign: "middle" }} />
          Processed
        </span>
      );
    case "PROCESSING":
      return (
        <span className="badge badge-blue">
          <Loader2 className="w-3 h-3 animate-spin" style={{ display: "inline", marginRight: "3px", verticalAlign: "middle" }} />
          Processing
        </span>
      );
    case "PENDING":
      return (
        <span className="badge badge-neutral">
          <Clock className="w-3 h-3" style={{ display: "inline", marginRight: "3px", verticalAlign: "middle" }} />
          Pending
        </span>
      );
    default:
      return (
        <span className="badge badge-danger">
          <AlertCircle className="w-3 h-3" style={{ display: "inline", marginRight: "3px", verticalAlign: "middle" }} />
          Failed
        </span>
      );
  }
}

// ── Score cell ─────────────────────────────────────────────────────────────────

function ScoreCell({ score, grade }: { score: number | null; grade?: string | null }) {
  if (score === null) {
    return <span style={{ fontSize: "12px", color: "var(--ink-3)" }}>—</span>;
  }
  return (
    <span
      style={{
        fontSize: "13px",
        fontWeight: 700,
        color: getScoreColor(score),
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {Math.round(score)}
      {grade && (
        <span style={{ fontSize: "11px", fontWeight: 500, marginLeft: "4px", color: "var(--ink-3)" }}>
          {grade}
        </span>
      )}
    </span>
  );
}

// ── Confirmation modal ─────────────────────────────────────────────────────────

interface DeleteModalProps {
  resume: HistoryItem;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteModal({ resume, deleting, onConfirm, onCancel }: DeleteModalProps) {
  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !deleting) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleting, onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget && !deleting) onCancel(); }}
    >
      <div
        className="card p-6 w-full max-w-md"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border-strong)" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "var(--danger-dim)", border: "1px solid var(--danger-border)" }}
          >
            <Trash2 className="w-4 h-4" style={{ color: "var(--danger)" }} />
          </div>
          {!deleting && (
            <button
              onClick={onCancel}
              className="btn btn-ghost"
              style={{ width: "28px", height: "28px", padding: 0 }}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--ink-1)", marginBottom: "8px" }}>
          Delete this resume?
        </h2>
        <p style={{ fontSize: "13px", color: "var(--ink-2)", lineHeight: 1.6, marginBottom: "6px" }}>
          <span style={{ fontWeight: 600, color: "var(--ink-1)" }}>{resume.title}</span> will be
          permanently deleted along with all associated data:
        </p>
        <ul
          style={{
            fontSize: "12px",
            color: "var(--ink-3)",
            listStyle: "disc",
            paddingLeft: "18px",
            lineHeight: 1.8,
            marginBottom: "20px",
          }}
        >
          <li>Extracted text and parsed fields</li>
          <li>ATS analysis results</li>
          <li>Job matching analyses</li>
          <li>AI recommendations and embeddings</li>
          <li>Uploaded file from storage</li>
        </ul>
        <p style={{ fontSize: "12px", color: "var(--danger)", marginBottom: "20px" }}>
          This action cannot be undone.
        </p>

        {/* Actions */}
        <div className="flex items-center gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="btn btn-ghost"
            style={{ height: "34px", fontSize: "13px" }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="btn btn-danger"
            style={{ height: "34px", fontSize: "13px", minWidth: "110px" }}
          >
            {deleting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Deleting…
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Toast ──────────────────────────────────────────────────────────────────────

interface ToastProps {
  message: string;
  type: "success" | "error";
  onDismiss: () => void;
}

function Toast({ message, type, onDismiss }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const isSuccess = type === "success";
  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg"
      style={{
        background: isSuccess ? "var(--surface-3)" : "var(--danger-dim)",
        border: `1px solid ${isSuccess ? "var(--border-strong)" : "var(--danger-border)"}`,
        maxWidth: "360px",
        animation: "page-in 0.2s ease forwards",
      }}
    >
      {isSuccess
        ? <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: "var(--success)" }} />
        : <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: "var(--danger)" }} />
      }
      <span style={{ fontSize: "13px", color: "var(--ink-1)", flex: 1 }}>{message}</span>
      <button
        onClick={onDismiss}
        className="btn btn-ghost"
        style={{ width: "22px", height: "22px", padding: 0, flexShrink: 0 }}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="py-16 flex flex-col items-center gap-3">
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center"
        style={{ background: "var(--surface-3)", border: "1px solid var(--border)" }}
      >
        <Clock className="w-5 h-5" style={{ color: "var(--ink-3)" }} />
      </div>
      <div className="text-center">
        <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink-2)" }}>No resumes yet</p>
        <p style={{ fontSize: "12px", color: "var(--ink-3)", marginTop: "4px" }}>
          Upload your first resume to see it here.
        </p>
      </div>
      <Link href="/upload">
        <button className="btn btn-primary mt-1" style={{ height: "34px", fontSize: "12px" }}>
          <Upload className="w-3.5 h-3.5" />
          Upload Resume
        </button>
      </Link>
    </div>
  );
}

// ── Table row ──────────────────────────────────────────────────────────────────

interface HistoryRowProps {
  item: HistoryItem;
  deletingId: string | null;
  onDeleteClick: (item: HistoryItem) => void;
}

function HistoryRow({ item, deletingId, onDeleteClick }: HistoryRowProps) {
  const isBeingDeleted = deletingId === item.id;

  return (
    <tr
      style={{
        borderBottom: "1px solid var(--border)",
        opacity: isBeingDeleted ? 0.4 : 1,
        transition: "opacity 0.2s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-2)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
    >
      {/* Resume title + filename */}
      <td className="px-5 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
            style={{ background: "var(--surface-3)", border: "1px solid var(--border)" }}
          >
            <FileText className="w-3.5 h-3.5" style={{ color: "var(--ink-3)" }} />
          </div>
          <div className="min-w-0">
            <p
              className="truncate"
              style={{ fontSize: "13px", fontWeight: 500, color: "var(--ink-1)", maxWidth: "220px" }}
            >
              {item.title}
            </p>
            {item.originalFileName !== item.title && (
              <p
                className="truncate caption mt-0.5"
                style={{ maxWidth: "220px" }}
              >
                {item.originalFileName}
              </p>
            )}
          </div>
        </div>
      </td>

      {/* Status */}
      <td className="px-5 py-3">
        <StatusBadge status={item.status} />
      </td>

      {/* ATS Score */}
      <td className="px-5 py-3">
        <ScoreCell score={item.atsScore} grade={item.atsGrade} />
      </td>

      {/* Job Match */}
      <td className="px-5 py-3">
        <ScoreCell score={item.jobMatchScore} />
      </td>

      {/* File size */}
      <td className="px-5 py-3">
        <span style={{ fontSize: "12px", color: "var(--ink-3)" }}>
          {item.fileSize ? formatBytes(item.fileSize) : "—"}
        </span>
      </td>

      {/* Uploaded date */}
      <td className="px-5 py-3">
        <span style={{ fontSize: "12px", color: "var(--ink-3)" }}>{formatDate(item.createdAt)}</span>
      </td>

      {/* Delete action */}
      <td className="px-5 py-3 text-right">
        <button
          onClick={() => onDeleteClick(item)}
          disabled={isBeingDeleted}
          className="btn btn-ghost"
          title="Delete resume"
          style={{
            width: "30px",
            height: "30px",
            padding: 0,
            color: "var(--ink-3)",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--danger)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--ink-3)"; }}
        >
          {isBeingDeleted
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Trash2 className="w-3.5 h-3.5" />
          }
        </button>
      </td>
    </tr>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Which resume is currently staged for deletion (modal open)
  const [deleteTarget, setDeleteTarget] = useState<HistoryItem | null>(null);
  // Which resume ID is currently being deleted (row dims, button spins)
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Extracted so the Refresh button can call it directly, and so the initial
  // load and any subsequent refresh share exactly the same code path.
  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.history.get(100, 0);
      setItems(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;

    const target = deleteTarget;
    setDeleteTarget(null);       // close modal immediately
    setDeletingId(target.id);   // dim the row and spin the button

    try {
      await api.resumes.delete(target.id);

      setItems((prev) => prev.filter((r) => r.id !== target.id));
      setTotal((t) => t - 1);
      setToast({ message: "Resume deleted successfully.", type: "success" });

      // Notify Dashboard and Resume Library to remove the item from their lists
      // without requiring a full page reload.
      window.dispatchEvent(
        new CustomEvent("resumora:resume-deleted", { detail: { id: target.id } }),
      );
    } catch (e) {
      setToast({
        message: e instanceof Error ? e.message : "Failed to delete resume. Please try again.",
        type: "error",
      });
    } finally {
      setDeletingId(null);
    }
  }, [deleteTarget]);

  const TABLE_HEADERS = ["Resume", "Status", "ATS Score", "Job Match", "Size", "Uploaded", ""];

  return (
    <AppLayout>
      {/* Toast notification */}
      {toast && (
        <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <DeleteModal
          resume={deleteTarget}
          deleting={deletingId !== null}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <div className="p-6 max-w-6xl mx-auto page-in">
        {/* Page header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="page-title mb-1">History</h1>
            <p className="caption">
              {loading
                ? "Loading…"
                : `${total} resume${total !== 1 ? "s" : ""} · newest first`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadHistory}
              disabled={loading}
              className="btn btn-ghost"
              title="Refresh history"
              style={{ height: "34px", fontSize: "12px", paddingInline: "10px" }}
            >
              {loading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <RefreshCw className="w-3.5 h-3.5" />}
            </button>
            <Link href="/upload">
              <button className="btn btn-primary" style={{ height: "34px", fontSize: "12px" }}>
                <Upload className="w-3.5 h-3.5" />
                Upload Resume
              </button>
            </Link>
          </div>
        </div>

        {/* Table card */}
        <div className="card overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="skeleton h-11 w-full rounded" />
              ))}
            </div>
          ) : error ? (
            <div
              className="m-4 px-4 py-3 rounded-lg"
              style={{
                background: "var(--danger-dim)",
                border: "1px solid var(--danger-border)",
              }}
            >
              <p style={{ fontSize: "13px", color: "var(--danger)" }}>{error}</p>
            </div>
          ) : items.length === 0 ? (
            <EmptyState />
          ) : (
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {TABLE_HEADERS.map((h) => (
                    <th
                      key={h}
                      className="text-left px-5 py-2.5"
                      style={{
                        fontSize: "11px",
                        color: "var(--ink-3)",
                        fontWeight: 600,
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <HistoryRow
                    key={item.id}
                    item={item}
                    deletingId={deletingId}
                    onDeleteClick={setDeleteTarget}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer count */}
        {!loading && !error && items.length > 0 && (
          <p style={{ fontSize: "11px", color: "var(--ink-3)", marginTop: "10px" }}>
            Showing {items.length} of {total} resume{total !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </AppLayout>
  );
}
