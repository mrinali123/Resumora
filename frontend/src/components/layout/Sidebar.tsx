"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BarChart2,
  Briefcase,
  Users,
  GitCompare,
  Clock,
  Upload,
  FileText,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const mainNav: NavItem[] = [
  { label: "Dashboard",      href: "/dashboard",    icon: LayoutDashboard },
  { label: "ATS Analysis",   href: "/analysis",     icon: BarChart2 },
  { label: "Job Matching",   href: "/job-matching", icon: Briefcase },
  { label: "Recruiter Mode", href: "/recruiter",    icon: Users },
  { label: "Comparison",     href: "/comparison",   icon: GitCompare },
  { label: "History",        href: "/history",      icon: Clock },
];

const secondaryNav: NavItem[] = [
  { label: "Resumes",        href: "/resumes",      icon: FileText },
  { label: "Upload",         href: "/upload",       icon: Upload },
  { label: "Settings",       href: "/settings",     icon: Settings },
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link href={item.href}>
      <div
        className={cn(
          "sidebar-item group",
          active && "active"
        )}
      >
        {active && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-blue-DEFAULT rounded-r-full"
               style={{ background: "var(--accent)" }} />
        )}
        <item.icon
          className={cn(
            "w-4 h-4 flex-shrink-0",
            active ? "text-[var(--ink-1)]" : "text-[var(--ink-3)]"
          )}
          strokeWidth={1.75}
        />
        <span className={active ? "text-[var(--ink-1)]" : ""}>{item.label}</span>
      </div>
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside
      className="relative flex flex-col h-full shrink-0 overflow-hidden"
      style={{
        width: "var(--sidebar-width)",
        background: "var(--surface-1)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Wordmark */}
      <div
        className="flex items-center gap-2.5 px-4"
        style={{
          height: "var(--topbar-height)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ background: "var(--accent)" }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M2 4h10M2 7h7M2 10h5"
              stroke="#fff"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <span
          className="font-semibold text-sm tracking-tight"
          style={{ color: "var(--ink-1)", letterSpacing: "-0.01em" }}
        >
          Resumora
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {/* Main */}
        <div className="mb-4">
          <p className="section-label px-2 mb-1.5">Workspace</p>
          <div className="space-y-0.5 relative">
            {mainNav.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={pathname === item.href || pathname.startsWith(item.href + "/")}
              />
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="divider mx-2 mb-4" />

        {/* Secondary */}
        <div>
          <p className="section-label px-2 mb-1.5">Library</p>
          <div className="space-y-0.5">
            {secondaryNav.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={pathname === item.href || pathname.startsWith(item.href + "/")}
              />
            ))}
          </div>
        </div>
      </nav>

      {/* User section */}
      <div style={{ borderTop: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2.5 px-3 py-3">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-white font-semibold"
            style={{
              fontSize: "10px",
              background: "linear-gradient(135deg, #3b5998, #5b8ef0)",
            }}
          >
            {user
              ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
              : "?"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate" style={{ color: "var(--ink-1)", fontSize: "12px" }}>
              {user ? `${user.firstName} ${user.lastName}` : ""}
            </div>
            <div className="truncate" style={{ color: "var(--ink-3)", fontSize: "11px" }}>
              {user?.email ?? ""}
            </div>
          </div>
          <button
            onClick={logout}
            className="w-6 h-6 flex items-center justify-center rounded flex-shrink-0 transition-colors"
            style={{ color: "var(--ink-3)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--danger)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--ink-3)"; }}
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
