"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Code2, Users, FolderOpen, Sparkles, Tag, BookOpen } from "lucide-react";
import { mockInterviewQuestions } from "@/lib/mock-data";

const tabs = [
  { label: "Technical", key: "technical" as const, icon: Code2, color: "#8b5cf6" },
  { label: "Behavioral", key: "behavioral" as const, icon: Users, color: "#10b981" },
  { label: "Project-Based", key: "project" as const, icon: FolderOpen, color: "#f59e0b" },
];

const difficultyColor: Record<string, string> = {
  Easy: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  Medium: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  Hard: "text-red-400 bg-red-500/10 border-red-500/20",
};

function QCard({ q, a, difficulty, tag }: { q: string; a: string; difficulty: string; tag: string }) {
  const [open, setOpen] = useState(false);

  return (
    <motion.div
      layout
      className="glass rounded-2xl overflow-hidden border border-[var(--border)] hover:border-violet-500/20 transition-colors"
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start gap-4 p-5 text-left"
      >
        <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <BookOpen className="w-4 h-4 text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[var(--text-primary)] leading-snug pr-2">{q}</div>
          <div className="flex items-center gap-2 mt-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${difficultyColor[difficulty]}`}>
              {difficulty}
            </span>
            <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
              <Tag className="w-2.5 h-2.5" />{tag}
            </span>
          </div>
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="flex-shrink-0">
          <ChevronDown className="w-5 h-5 text-[var(--text-muted)]" />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="px-5 pb-5 pt-0">
              <div className="border-t border-[var(--border)] pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                  <span className="text-xs font-semibold text-violet-400">Model Answer</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{a}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function InterviewPrepPage() {
  const [activeTab, setActiveTab] = useState<"technical" | "behavioral" | "project">("technical");

  const questions = mockInterviewQuestions[activeTab];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Interview Prep</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">Tailored to your resume · Google SWE focus</p>
      </motion.div>

      {/* Stats */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="grid grid-cols-3 gap-4">
        {[
          { label: "Technical Qs", count: mockInterviewQuestions.technical.length, color: "#8b5cf6" },
          { label: "Behavioral Qs", count: mockInterviewQuestions.behavioral.length, color: "#10b981" },
          { label: "Project Qs", count: mockInterviewQuestions.project.length, color: "#f59e0b" },
        ].map((s) => (
          <div key={s.label} className="glass rounded-2xl p-4 text-center">
            <div className="text-3xl font-black" style={{ color: s.color }}>{s.count}</div>
            <div className="text-xs text-[var(--text-muted)] mt-1">{s.label}</div>
          </div>
        ))}
      </motion.div>

      {/* Tabs */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
        className="flex p-1 rounded-2xl glass border border-[var(--border)] w-fit gap-1">
        {tabs.map(({ label, key, icon: Icon, color }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === key
                ? "text-white"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            {activeTab === key && (
              <motion.div layoutId="activeTab" className="absolute inset-0 rounded-xl bg-gradient-to-r from-violet-600 to-violet-500" transition={{ type: "spring", stiffness: 300, damping: 30 }} />
            )}
            <Icon className="w-4 h-4 relative z-10" />
            <span className="relative z-10">{label}</span>
          </button>
        ))}
      </motion.div>

      {/* Questions */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="space-y-3"
        >
          {questions.map((q, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
              <QCard q={q.q} a={q.answer} difficulty={q.difficulty} tag={q.tag} />
            </motion.div>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
