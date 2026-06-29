"use client";

import { usePathname } from "next/navigation";
import { Search, Bell, HelpCircle } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/context/auth-context";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard":    "Dashboard",
  "/analysis":     "ATS Analysis",
  "/job-matching": "Job Matching",
  "/recruiter":    "Recruiter Mode",
  "/comparison":   "Comparison",
  "/history":      "History",
  "/resumes":      "Resume Library",
  "/upload":       "Upload Resume",
  "/settings":     "Settings",
};

export default function TopBar() {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const { user } = useAuth();

  const title = PAGE_TITLES[pathname] ?? "Resumora";

  return (
    <header
      className="flex items-center px-5 gap-4 shrink-0"
      style={{
        height: "var(--topbar-height)",
        background: "var(--surface-1)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Page title */}
      <span
        className="font-semibold flex-1 truncate"
        style={{ fontSize: "14px", color: "var(--ink-1)", letterSpacing: "-0.01em" }}
      >
        {title}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {/* Search */}
        {searchOpen ? (
          <div className="flex items-center">
            <input
              autoFocus
              type="text"
              placeholder="Search..."
              onBlur={() => setSearchOpen(false)}
              className="input w-52 h-7 px-3 text-xs"
              style={{ fontSize: "12px" }}
            />
          </div>
        ) : (
          <button
            className="btn btn-ghost w-7 h-7 p-0"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
          >
            <Search className="w-4 h-4" style={{ color: "var(--ink-2)" }} />
          </button>
        )}

        <button className="btn btn-ghost w-7 h-7 p-0 relative" aria-label="Notifications">
          <Bell className="w-4 h-4" style={{ color: "var(--ink-2)" }} />
          <span
            className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--accent)" }}
          />
        </button>

        <button className="btn btn-ghost w-7 h-7 p-0" aria-label="Help">
          <HelpCircle className="w-4 h-4" style={{ color: "var(--ink-2)" }} />
        </button>

        {/* Divider */}
        <div
          className="w-px h-5 mx-1"
          style={{ background: "var(--border)" }}
        />

        {/* User */}
        <button className="flex items-center gap-2 btn btn-ghost px-2 h-7">
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
            style={{
              fontSize: "9px",
              background: "linear-gradient(135deg, #3b5998, #5b8ef0)",
            }}
          >
            {user
              ? `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase()
              : "?"}
          </div>
          <span style={{ fontSize: "12px", color: "var(--ink-2)" }}>
            {user?.firstName ?? ""}
          </span>
        </button>
      </div>
    </header>
  );
}
