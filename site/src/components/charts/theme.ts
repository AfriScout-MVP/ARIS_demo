/** Shared recharts styling so every chart in ARIS reads as one system. */

export const chartColors = {
  chalk: "#f1f5f9",
  chalkDim: "#94a3b8",
  faint: "#64748b",
  grid: "rgba(148,163,184,0.16)",
  pitch: "#22c55e",
  pitchSoft: "#4ade80",
  amber: "#eab308",
  red: "#ef4444",
  var: "#38bdf8",
  gold: "#b88a0d",
};

export const tooltipStyle = {
  background: "#1e293b",
  border: "1px solid rgba(148,163,184,0.36)",
  borderRadius: 8,
  fontSize: 12,
  color: "#f1f5f9",
  padding: "8px 10px",
};

export const axisProps = {
  stroke: chartColors.faint,
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

/** Decision outcomes always use the same four colours, in the same order. */
export const decisionColors: Record<string, string> = {
  correct: chartColors.pitch,
  "correct-var": chartColors.var,
  overturned: chartColors.amber,
  missed: chartColors.red,
};
