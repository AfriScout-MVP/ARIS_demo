/**
 * Shared recharts styling so every chart in ARIS reads as one system.
 *
 * Colours are CSS variables, not hex: they resolve through the active theme
 * (see `:root` / `html.dark` in globals.css), so a chart redraws in the right
 * ink when the theme flips, with no re-render.
 */

export const chartColors = {
  chalk: "var(--chalk)",
  chalkDim: "var(--chalk-faint)",
  faint: "var(--chalk-faint)",
  grid: "var(--line)",
  pitch: "var(--pitch)",
  pitchSoft: "var(--pitch-soft)",
  amber: "var(--amber)",
  red: "var(--card-red)",
  var: "var(--var)",
  gold: "var(--gold-soft)",
};

export const tooltipStyle = {
  background: "var(--ink-2)",
  border: "1px solid var(--line-strong)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--chalk)",
  padding: "8px 10px",
  boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.2)",
};

/** The hover wash behind a bar, tinted to suit either theme. */
export const barCursor = { fill: "color-mix(in srgb, var(--wash) 6%, transparent)" };

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
