"use client";

import { motion } from "framer-motion";
import { BarChart3, CheckCircle, XCircle, Info, TrendingUp, Sparkles } from "lucide-react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
  Tooltip, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { mockATSData } from "@/lib/mock-data";
import { getScoreColor, getScoreLabel } from "@/lib/utils";

const breakdownLabels: Record<string, { label: string; tip: string }> = {
  skills:     { label: "Skills Match",   tip: "How well your skills align with common JD requirements" },
  experience: { label: "Experience",     tip: "Relevance and depth of work history" },
  education:  { label: "Education",      tip: "Academic credentials vs. role requirements" },
  keywords:   { label: "Keyword Coverage", tip: "ATS-critical keywords found in resume" },
  formatting: { label: "Formatting",     tip: "Clean structure, section headers, bullet points" },
  impact:     { label: "Impact Metrics", tip: "Quantified achievements: %, $, #" },
};

function ScoreBar({ score, color, delay }: { score: number; color: string; delay: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full bg-[var(--border)] overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 1, delay, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${color}88, ${color})`, boxShadow: `0 0 8px ${color}44` }}
        />
      </div>
      <span className="text-sm font-bold w-8 text-right" style={{ color }}>{score}</span>
    </div>
  );
}

const CustomRadarTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass px-3 py-2 rounded-xl border border-[var(--border)] text-xs">
      <div className="font-semibold text-[var(--text-primary)]">{payload[0].payload.subject}</div>
      <div className="text-violet-400 font-bold">{payload[0].value}/100</div>
    </div>
  );
};

export default function ATSScorePage() {
  const { overall, breakdown, radarData, keywordsFound, keywordsMissed, topRecommendations } = mockATSData;
  const color = getScoreColor(overall);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">ATS Score Analysis</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">Mrinali_Parida_SWE.pdf · Analyzed against Google SWE JD</p>
      </motion.div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Overall score */}
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}
          className="glass rounded-2xl p-6 flex flex-col items-center justify-center text-center">
          <div className="text-xs font-semibold text-[var(--text-muted)] mb-4 uppercase tracking-wider">Overall ATS Score</div>

          {/* Big ring */}
          <div className="relative w-44 h-44 mb-4">
            <svg width="176" height="176" className="rotate-[-90deg]">
              <circle cx="88" cy="88" r="76" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
              <motion.circle cx="88" cy="88" r="76" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
                strokeDasharray={477.5} initial={{ strokeDashoffset: 477.5 }}
                animate={{ strokeDashoffset: 477.5 - (overall / 100) * 477.5 }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                style={{ filter: `drop-shadow(0 0 12px ${color})` }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-5xl font-black" style={{ color }}>{overall}</span>
              <span className="text-xs text-[var(--text-muted)]">out of 100</span>
            </div>
          </div>

          <div className="px-4 py-1.5 rounded-full text-sm font-bold border"
            style={{ color, borderColor: `${color}40`, background: `${color}12` }}>
            {getScoreLabel(overall)}
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-3">Top 8% of all applicants</p>
        </motion.div>

        {/* Radar chart */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}
          className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-violet-400" />
            <h3 className="font-semibold text-sm text-[var(--text-primary)]">Score Radar</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="rgba(255,255,255,0.06)" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: "var(--text-muted)", fontSize: 10 }} />
              <Radar name="Score" dataKey="score" stroke="#8b5cf6" strokeWidth={2}
                fill="#8b5cf6" fillOpacity={0.15}
                dot={{ fill: "#8b5cf6", r: 4 }}
              />
              <Tooltip content={<CustomRadarTooltip />} />
            </RadarChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Score breakdown bars */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}
          className="glass rounded-2xl p-5">
          <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-4">Score Breakdown</h3>
          <div className="space-y-4">
            {Object.entries(breakdown).map(([key, score], i) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-[var(--text-primary)]">{breakdownLabels[key].label}</span>
                    <span title={breakdownLabels[key].tip}><Info className="w-3 h-3 text-[var(--text-muted)]" /></span>
                  </div>
                </div>
                <ScoreBar score={score} color={getScoreColor(score)} delay={0.3 + i * 0.08} />
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Keywords + Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <h3 className="font-semibold text-sm text-[var(--text-primary)]">Keywords Found</h3>
            <span className="ml-auto text-xs font-bold text-emerald-400">{keywordsFound.length}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {keywordsFound.map((kw) => (
              <span key={kw} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {kw}
              </span>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
          className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <XCircle className="w-4 h-4 text-red-400" />
            <h3 className="font-semibold text-sm text-[var(--text-primary)]">Keywords Missed</h3>
            <span className="ml-auto text-xs font-bold text-red-400">{keywordsMissed.length}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {keywordsMissed.map((kw) => (
              <span key={kw} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                {kw}
              </span>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <h3 className="font-semibold text-sm text-[var(--text-primary)]">AI Recommendations</h3>
          </div>
          <div className="space-y-2.5">
            {topRecommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-violet-500/5 border border-violet-500/10">
                <TrendingUp className="w-3.5 h-3.5 text-violet-400 flex-shrink-0 mt-0.5" />
                <span className="text-xs text-[var(--text-secondary)]">{rec}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
