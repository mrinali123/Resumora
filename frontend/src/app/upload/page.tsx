"use client";

import AppLayout from "@/components/layout/AppLayout";
import { useState, useCallback, useRef, useEffect } from "react";
import { Upload, FileText, CheckCircle, Loader2, AlertCircle, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import { formatBytes } from "@/lib/utils";

type UploadState = "idle" | "drag" | "uploading" | "polling" | "done" | "error";

const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
};

function friendlyUploadError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return "Cannot connect to the backend. Make sure the server is running on port 3000.";
    if (err.status === 401) return "Your session has expired. Please sign in again.";
    if (err.status === 413) return "File is too large. Maximum size is 10 MB.";
    if (err.status === 422) return err.message;
    if (err.status >= 500) return "Server error. Please try again in a moment.";
    return err.message || "Upload failed. Please try again.";
  }
  const msg = (err as Error)?.message ?? "";
  if (msg.includes("Expected JSON") || msg.includes("unknown content type")) {
    return "Cannot reach the backend. Make sure the server is running on port 3000.";
  }
  return msg || "Upload failed. Please try again.";
}

const POLL_INTERVAL_MS = 2_000;
const MAX_POLLS = 90; // 90 × 2s = 3 minutes

export default function UploadPage() {
  const router = useRouter();
  const [state, setState] = useState<UploadState>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("Uploading…");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollCountRef = useRef(0);

  // Auto-navigate to library 2 s after completion
  useEffect(() => {
    if (state !== "done") return;
    const t = setTimeout(() => router.push("/resumes"), 2_000);
    return () => clearTimeout(t);
  }, [state, router]);

  const pollJob = useCallback(async (jobId: string) => {
    pollCountRef.current = 0;

    while (pollCountRef.current < MAX_POLLS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      pollCountRef.current++;

      try {
        const status = await api.jobs.status(jobId);
        // Map raw progress (0–100) into the 30–95 visual band
        const visual = 30 + Math.round((status.progress / 100) * 65);
        setProgress(Math.min(visual, 95));

        if (status.progress < 30) setStatusMsg("Extracting text…");
        else if (status.progress < 55) setStatusMsg("Parsing resume structure…");
        else if (status.progress < 75) setStatusMsg("Generating embeddings…");
        else setStatusMsg("Finalising…");

        if (status.status === "completed") {
          setProgress(100);
          setStatusMsg("Complete!");
          setState("done");
          return;
        }
        if (status.status === "failed") {
          throw new Error(status.failedReason ?? "Processing failed on the server.");
        }
      } catch (err) {
        setState("error");
        setErrorMsg(friendlyUploadError(err));
        return;
      }
    }

    // Timed out — resume may still be processing in the background
    setState("error");
    setErrorMsg(
      "Processing is taking longer than expected. " +
      "Your resume has been saved — check the library in a minute.",
    );
  }, []);

  const handleFile = useCallback(
    async (f: File) => {
      // Client-side validation — must match backend ALLOWED_MIME_TYPES exactly
      if (!ALLOWED_TYPES[f.type]) {
        setState("error");
        const ext = f.name.split(".").pop()?.toUpperCase() ?? "unknown";
        setErrorMsg(
          `Only PDF and DOCX files are supported. ` +
          `The selected file appears to be ${ext}. ` +
          `Please convert it first.`,
        );
        return;
      }

      setFile(f);
      setState("uploading");
      setProgress(10);
      setStatusMsg("Uploading…");
      setErrorMsg(null);
      pollCountRef.current = 0;

      try {
        const result = await api.resumes.upload(f);

        // Both async (Redis) and sync (no Redis) paths now return { resumeId }
        setResumeId(result.resumeId ?? null);
        setProgress(30);

        if (result.jobId) {
          // Async path: worker is processing — poll for completion
          setState("polling");
          setStatusMsg("Extracting text…");
          await pollJob(result.jobId);
        } else {
          // Sync path: pipeline already ran inline — upload is complete
          setProgress(100);
          setStatusMsg("Complete!");
          setState("done");
        }
      } catch (err) {
        setState("error");
        setErrorMsg(friendlyUploadError(err));
      }
    },
    [pollJob],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setState((prev) => (prev === "drag" ? "idle" : prev));
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const reset = () => {
    setState("idle");
    setFile(null);
    setProgress(0);
    setStatusMsg("Uploading…");
    setErrorMsg(null);
    setResumeId(null);
    pollCountRef.current = 0;
    if (inputRef.current) inputRef.current.value = "";
  };

  const isWorking = state === "uploading" || state === "polling";
  const showDropZone = state === "idle" || state === "drag" || state === "error";

  const dropBorder =
    state === "drag" ? "var(--accent)" :
    state === "error" ? "var(--danger)" :
    "var(--border)";

  const dropBg = state === "drag" ? "rgba(91,142,240,0.04)" : "var(--surface-1)";

  return (
    <AppLayout>
      <div className="p-6 max-w-2xl mx-auto page-in">
        <div className="mb-6">
          <h1 className="page-title mb-1">Upload Resume</h1>
          <p className="caption">PDF or DOCX up to 10 MB. Processed securely and never shared.</p>
        </div>

        {/* ── Drop zone ─────────────────────────────────────────────────────── */}
        {showDropZone && (
          <div
            onDragOver={(e) => { e.preventDefault(); setState("drag"); }}
            onDragLeave={(e) => {
              // Only reset if leaving the zone itself, not a child element
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setState((prev) => prev === "drag" ? "idle" : prev);
              }
            }}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className="rounded-xl cursor-pointer transition-colors"
            style={{
              border: `2px dashed ${dropBorder}`,
              background: dropBg,
              padding: "64px 32px",
              textAlign: "center",
            }}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4"
              style={{
                background: state === "error" ? "var(--danger-dim)" :
                            state === "drag" ? "rgba(91,142,240,0.12)" : "var(--surface-3)",
                border: `1px solid ${state === "error" ? "var(--danger-border)" :
                                     state === "drag" ? "var(--accent-border)" : "var(--border)"}`,
              }}
            >
              {state === "error" ? (
                <AlertCircle className="w-5 h-5" style={{ color: "var(--danger)" }} />
              ) : (
                <Upload
                  className="w-5 h-5"
                  style={{ color: state === "drag" ? "var(--accent)" : "var(--ink-2)" }}
                />
              )}
            </div>

            <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink-1)", marginBottom: "6px" }}>
              {state === "error" ? "Upload failed — try again" :
               state === "drag" ? "Release to upload" :
               "Drop your resume here"}
            </p>
            <p style={{ fontSize: "12px", color: "var(--ink-3)" }}>
              {state === "error" ? (
                <span style={{ color: "var(--accent)" }}>Browse files</span>
              ) : (
                <><span style={{ color: "var(--accent)" }}>Browse files</span> or drag and drop</>
              )}
            </p>
            <p style={{ fontSize: "11px", color: "var(--ink-3)", marginTop: "12px" }}>
              PDF, DOCX only &middot; Max 10 MB
            </p>

            {state === "error" && errorMsg && (
              <p
                className="mt-4 mx-auto px-3 py-2 rounded-md"
                style={{
                  fontSize: "12px",
                  color: "var(--danger)",
                  background: "var(--danger-dim)",
                  border: "1px solid var(--danger-border)",
                  maxWidth: "400px",
                  lineHeight: "1.5",
                  cursor: "default",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {errorMsg}
              </p>
            )}
          </div>
        )}

        {/* ── Working state ──────────────────────────────────────────────────── */}
        {isWorking && file && (
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0"
                style={{ background: "var(--surface-3)", border: "1px solid var(--border)" }}
              >
                <FileText className="w-4 h-4" style={{ color: "var(--ink-2)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-1)", lineHeight: 1.3 }}
                   className="truncate">
                  {file.name}
                </p>
                <p style={{ fontSize: "11px", color: "var(--ink-3)", marginTop: "2px" }}>
                  {formatBytes(file.size)}
                </p>
              </div>
              <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: "var(--accent)" }} />
            </div>

            <div
              className="rounded-full overflow-hidden mb-2"
              style={{ height: "4px", background: "var(--surface-3)" }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${progress}%`,
                  background: "var(--accent)",
                  transition: "width 0.5s ease",
                }}
              />
            </div>

            <div className="flex items-center justify-between">
              <span style={{ fontSize: "11px", color: "var(--ink-3)" }}>{statusMsg}</span>
              <span style={{ fontSize: "11px", color: "var(--accent)", fontWeight: 600 }}>
                {progress}%
              </span>
            </div>
          </div>
        )}

        {/* ── Done state ─────────────────────────────────────────────────────── */}
        {state === "done" && file && (
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-5">
              <div
                className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0"
                style={{ background: "var(--success-dim)", border: "1px solid var(--success-border)" }}
              >
                <CheckCircle className="w-4 h-4" style={{ color: "var(--success)" }} />
              </div>
              <div>
                <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-1)" }}>
                  Upload complete
                </p>
                <p style={{ fontSize: "11px", color: "var(--ink-3)", marginTop: "2px" }}>
                  {file.name} &middot; Redirecting to your library…
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                className="btn btn-primary"
                style={{ height: "34px", fontSize: "12px", paddingInline: "16px" }}
                onClick={() => router.push("/resumes")}
              >
                <ArrowRight className="w-3.5 h-3.5 mr-1.5" />
                Go to library now
              </button>
              <button
                className="btn btn-ghost"
                style={{ height: "34px", fontSize: "12px" }}
                onClick={reset}
              >
                Upload another
              </button>
            </div>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            // Clear so same file can be re-selected after an error
            e.target.value = "";
          }}
        />

        {/* ── Tips ──────────────────────────────────────────────────────────── */}
        {(state === "idle" || state === "error") && (
          <div className="mt-6">
            <p className="section-label mb-3">Tips for better results</p>
            <div className="space-y-2">
              {[
                "Use standard headings: Experience, Skills, Education, Projects",
                "Include quantified impact — numbers score significantly higher",
                "Avoid tables, columns, or graphics — ATS parsers prefer plain text",
                "Tailor your resume to the job description using Job Matching",
              ].map((tip, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
                    style={{ background: "var(--ink-3)" }}
                  />
                  <p style={{ fontSize: "13px", color: "var(--ink-2)", lineHeight: "1.5" }}>{tip}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
