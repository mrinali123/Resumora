"use client";

import { motion } from "framer-motion";
import { FileText, User, Mail, Phone, MapPin, Briefcase, GraduationCap, Code2, Lightbulb, TrendingUp, AlertCircle } from "lucide-react";
import { mockResumeDetail } from "@/lib/mock-data";

export default function ResumeDetailPage() {
  const r = mockResumeDetail;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Resume Detail</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">Mrinali_Parida_SWE.pdf · ATS Score: 87</p>
      </motion.div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Left: Raw text */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}
          className="glass rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border)] flex items-center gap-2">
            <FileText className="w-4 h-4 text-violet-400" />
            <span className="font-semibold text-sm text-[var(--text-primary)]">Raw Extracted Text</span>
          </div>
          <div className="p-5 max-h-[600px] overflow-y-auto">
            <pre className="text-xs text-[var(--text-secondary)] font-mono whitespace-pre-wrap leading-relaxed">
              {r.rawText}
            </pre>
          </div>
        </motion.div>

        {/* Right: Structured data */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}
          className="space-y-4">

          {/* Contact info */}
          <div className="glass rounded-2xl p-5">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
                {r.name.split(" ").map(n => n[0]).join("")}
              </div>
              <div className="flex-1">
                <h2 className="font-bold text-lg text-[var(--text-primary)]">{r.name}</h2>
                <div className="grid grid-cols-2 gap-1.5 mt-2">
                  {[
                    { icon: Mail, text: r.email },
                    { icon: Phone, text: r.phone },
                    { icon: MapPin, text: r.location },
                    { icon: Code2, text: r.github },
                  ].map(({ icon: Icon, text }) => (
                    <div key={text} className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                      <Icon className="w-3 h-3 flex-shrink-0" /><span className="truncate">{text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Skills */}
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Code2 className="w-4 h-4 text-violet-400" />
              <h3 className="font-semibold text-sm text-[var(--text-primary)]">Skills</h3>
              <span className="ml-auto text-xs text-[var(--text-muted)]">{r.structured.skills.length} detected</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {r.structured.skills.map((skill) => (
                <motion.span key={skill} whileHover={{ scale: 1.05 }}
                  className="px-3 py-1 rounded-full text-xs font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20 cursor-default">
                  {skill}
                </motion.span>
              ))}
            </div>
          </div>

          {/* Experience */}
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Briefcase className="w-4 h-4 text-cyan-400" />
              <h3 className="font-semibold text-sm text-[var(--text-primary)]">Experience</h3>
            </div>
            <div className="space-y-4">
              {r.structured.experience.map((exp, i) => (
                <div key={i} className="relative pl-4 border-l-2 border-violet-500/30">
                  <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-violet-500" />
                  <div className="font-semibold text-sm text-[var(--text-primary)]">{exp.role}</div>
                  <div className="text-xs text-violet-400">{exp.company} · {exp.duration}</div>
                  <ul className="mt-2 space-y-1">
                    {exp.highlights.map((h, j) => (
                      <li key={j} className="text-xs text-[var(--text-muted)] flex items-start gap-1.5">
                        <span className="mt-1.5 w-1 h-1 rounded-full bg-violet-500/50 flex-shrink-0" />
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Education */}
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <GraduationCap className="w-4 h-4 text-emerald-400" />
              <h3 className="font-semibold text-sm text-[var(--text-primary)]">Education</h3>
            </div>
            {r.structured.education.map((edu, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                  <GraduationCap className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <div className="font-semibold text-sm text-[var(--text-primary)]">{edu.degree}</div>
                  <div className="text-xs text-[var(--text-muted)]">{edu.institution} · {edu.year}</div>
                  <div className="text-xs text-emerald-400 mt-0.5">CGPA {edu.gpa}</div>
                </div>
              </div>
            ))}
          </div>

          {/* AI Insights */}
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Lightbulb className="w-4 h-4 text-amber-400" />
              <h3 className="font-semibold text-sm text-[var(--text-primary)]">AI Insights</h3>
            </div>
            <div className="space-y-2">
              {r.insights.map((insight, i) => (
                <div key={i} className={`flex items-start gap-2.5 p-3 rounded-xl text-xs
                  ${insight.type === "strength"
                    ? "bg-emerald-500/8 border border-emerald-500/15 text-emerald-400"
                    : "bg-amber-500/8 border border-amber-500/15 text-amber-400"
                  }`}
                >
                  {insight.type === "strength"
                    ? <TrendingUp className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  }
                  {insight.text}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
