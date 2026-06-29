"use client";

import { motion } from "framer-motion";
import { Map, CheckCircle, Circle, Clock, Zap, TrendingUp } from "lucide-react";
import { mockRoadmap } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const priorityStyle: Record<string, string> = {
  High:   "text-red-400 bg-red-500/10 border-red-500/20",
  Medium: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  Low:    "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
};

const statusIcons: Record<string, React.ElementType> = {
  "in-progress": Zap,
  upcoming: Circle,
  completed: CheckCircle,
};

export default function LearningRoadmapPage() {
  const total = mockRoadmap.length;
  const completed = mockRoadmap.filter((r) => r.status === "completed").length;
  const inProgress = mockRoadmap.filter((r) => r.status === "in-progress").length;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Learning Roadmap</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">12-week plan · Targeting Google SWE L4+</p>
      </motion.div>

      {/* Progress overview */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-violet-400" />
            <span className="font-semibold text-sm text-[var(--text-primary)]">Overall Progress</span>
          </div>
          <span className="text-xs font-bold text-violet-400">{completed}/{total} phases</span>
        </div>
        <div className="h-2.5 rounded-full bg-[var(--border)] overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(completed / total) * 100}%` }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className="h-full rounded-full bg-gradient-to-r from-violet-600 to-cyan-500"
            style={{ boxShadow: "0 0 12px rgba(139,92,246,0.4)" }}
          />
        </div>
        <div className="flex gap-4 mt-3 text-xs text-[var(--text-muted)]">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" />{completed} completed</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />{inProgress} in progress</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[var(--border)]" />{total - completed - inProgress} upcoming</span>
        </div>
      </motion.div>

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-6 top-0 bottom-0 w-[2px] timeline-line rounded-full" />

        <div className="space-y-5 pl-16 relative">
          {mockRoadmap.map((phase, i) => {
            const StatusIcon = statusIcons[phase.status];
            const isActive = phase.status === "in-progress";
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className={cn(
                  "relative glass rounded-2xl p-5 transition-all card-lift",
                  isActive && "border-violet-500/30 shadow-glow-sm"
                )}
              >
                {/* Timeline node */}
                <div
                  className={cn(
                    "absolute -left-[48px] top-5 w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all",
                    isActive
                      ? "border-violet-500 bg-violet-500/20 shadow-glow-sm"
                      : phase.status === "completed"
                      ? "border-emerald-500 bg-emerald-500/20"
                      : "border-[var(--border)] bg-[var(--bg-secondary)]"
                  )}
                >
                  <StatusIcon className={cn(
                    "w-4 h-4",
                    isActive ? "text-violet-400" : phase.status === "completed" ? "text-emerald-400" : "text-[var(--text-muted)]"
                  )} />
                  {isActive && <div className="absolute inset-0 rounded-full bg-violet-500/20 animate-ping" />}
                </div>

                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2.5 mb-1">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ color: phase.color, background: `${phase.color}18`, border: `1px solid ${phase.color}30` }}>
                        {phase.week}
                      </span>
                      {isActive && (
                        <span className="text-[10px] font-bold text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Zap className="w-2.5 h-2.5" />Current
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-[var(--text-primary)]">{phase.phase}</h3>
                  </div>
                  <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border flex-shrink-0 ${priorityStyle[phase.priority]}`}>
                    {phase.priority} Priority
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {phase.skills.map((skill) => (
                    <div key={skill} className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)]">
                      <CheckCircle className="w-3 h-3 text-[var(--text-muted)]" />
                      {skill}
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Footer CTA */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
        className="glass rounded-2xl p-5 text-center border border-violet-500/10">
        <p className="text-sm text-[var(--text-secondary)] mb-3">
          Complete this roadmap to unlock your <span className="gradient-text font-bold">Google-ready profile</span>
        </p>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 text-white text-sm font-semibold shadow-glow-md"
        >
          Track Progress
        </motion.button>
      </motion.div>
    </div>
  );
}
