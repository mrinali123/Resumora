import type { AtsAnalysisResult } from "./api-client";

function getScoreLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 80) return "Strong";
  if (score >= 70) return "Good";
  if (score >= 60) return "Fair";
  if (score >= 50) return "Below Average";
  return "Poor";
}

export async function exportAtsPdf(data: AtsAnalysisResult, resumeName: string): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const W = 210;
  const MARGIN = 18;
  const contentW = W - MARGIN * 2;
  let y = 0;

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const hex = (h: string) => {
    const r = parseInt(h.slice(1, 3), 16);
    const g = parseInt(h.slice(3, 5), 16);
    const b = parseInt(h.slice(5, 7), 16);
    return [r, g, b] as [number, number, number];
  };

  const scoreColor = (s: number): string =>
    s >= 80 ? "#22c55e" : s >= 60 ? "#f59e0b" : "#ef4444";

  const fillRect = (x: number, fy: number, w: number, h: number, color: string) => {
    doc.setFillColor(...hex(color));
    doc.rect(x, fy, w, h, "F");
  };

  const addPage = () => {
    doc.addPage();
    y = MARGIN;
  };

  const checkY = (needed: number) => {
    if (y + needed > 277) addPage();
  };

  // ── Header ────────────────────────────────────────────────────────────────────
  fillRect(0, 0, W, 38, "#0f172a");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Resumora", MARGIN, 16);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(148, 163, 184);
  doc.text("ATS Analysis Report", MARGIN, 23);
  doc.text(resumeName, MARGIN, 29);
  doc.text(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), MARGIN, 35);

  y = 48;

  // ── Score summary ─────────────────────────────────────────────────────────────
  const scoreCol = scoreColor(data.overallScore);
  fillRect(MARGIN, y, contentW, 28, "#1e293b");
  doc.setTextColor(...hex(scoreCol));
  doc.setFontSize(32);
  doc.setFont("helvetica", "bold");
  doc.text(String(data.overallScore), MARGIN + 8, y + 18);
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text("/ 100", MARGIN + 26, y + 18);
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text(getScoreLabel(data.overallScore), MARGIN + 50, y + 12);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(148, 163, 184);
  doc.text(`Recruiter decision: ${data.recruiter.decision}`, MARGIN + 50, y + 20);
  doc.text(`Shortlist probability: ${data.recruiter.shortlistProbability}%`, MARGIN + 50, y + 27);
  y += 36;

  // ── Score breakdown ───────────────────────────────────────────────────────────
  checkY(14);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("Score Breakdown", MARGIN, y);
  y += 6;

  const components = data.components ?? [];
  for (const comp of components) {
    checkY(10);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text(comp.name, MARGIN, y + 3.5);
    const barX = MARGIN + 60;
    const barW = contentW - 70;
    fillRect(barX, y, barW, 5, "#e2e8f0");
    fillRect(barX, y, (comp.raw_score / 100) * barW, 5, scoreColor(comp.raw_score));
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...hex(scoreColor(comp.raw_score)));
    doc.text(String(comp.raw_score), barX + barW + 3, y + 4);
    y += 10;
  }

  y += 4;

  // ── Summary ───────────────────────────────────────────────────────────────────
  if (data.summary) {
    checkY(20);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text("Summary", MARGIN, y);
    y += 5;
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    const lines = doc.splitTextToSize(data.summary, contentW) as string[];
    for (const line of lines) {
      checkY(5);
      doc.text(line, MARGIN, y);
      y += 5;
    }
    y += 4;
  }

  // ── Strengths ────────────────────────────────────────────────────────────────
  if ((data.strengths ?? []).length > 0) {
    checkY(14);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text("Strengths", MARGIN, y);
    y += 5;
    for (const item of data.strengths ?? []) {
      const lines = doc.splitTextToSize(`• ${item}`, contentW - 4) as string[];
      checkY(lines.length * 5 + 2);
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      for (const line of lines) {
        doc.text(line, MARGIN + 2, y);
        y += 5;
      }
    }
    y += 3;
  }

  // ── Areas to improve ─────────────────────────────────────────────────────────
  if ((data.improvementAreas ?? []).length > 0) {
    checkY(14);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text("Areas to Improve", MARGIN, y);
    y += 5;
    for (const item of data.improvementAreas ?? []) {
      const lines = doc.splitTextToSize(`• ${item}`, contentW - 4) as string[];
      checkY(lines.length * 5 + 2);
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      for (const line of lines) {
        doc.text(line, MARGIN + 2, y);
        y += 5;
      }
    }
    y += 3;
  }

  // ── Recruiter notes ───────────────────────────────────────────────────────────
  if (data.recruiter.recruiterNotes) {
    checkY(20);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text("Recruiter Simulation", MARGIN, y);
    y += 5;
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    const lines = doc.splitTextToSize(data.recruiter.recruiterNotes, contentW) as string[];
    for (const line of lines) {
      checkY(5);
      doc.text(line, MARGIN, y);
      y += 5;
    }
  }

  // ── Footer on every page ──────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`Generated by Resumora · Page ${i} of ${pageCount}`, MARGIN, 291);
  }

  const filename = `resumora-ats-${resumeName.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.pdf`;
  doc.save(filename);
}
