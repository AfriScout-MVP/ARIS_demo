/**
 * A pitch drawn to the Laws' dimensions — 105 × 68 m, with the penalty arcs,
 * corner arcs and goals that make it read as a pitch rather than a rectangle.
 * Everything placed on it is given in metres, so a distance on the map is the
 * same number the panels quote.
 */

export const PITCH_LENGTH = 105;
export const PITCH_WIDTH = 68;

/** The channel the referee is meant to hold, from one corner to the other. */
export function corridorY(x: number) {
  return 10 + (x / PITCH_LENGTH) * 48;
}

export function Pitch({ children }: { children?: React.ReactNode }) {
  return (
    <svg
      viewBox="-3 -3 111 74"
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <defs>
        {/* Density is blurred as one field, not stacked as discrete blobs. */}
        <filter id="aris-heat" x="-15%" y="-15%" width="130%" height="130%">
          <feGaussianBlur stdDeviation="3.1" />
        </filter>
        <linearGradient id="aris-turf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#101d2e" />
          <stop offset="100%" stopColor="#0b1524" />
        </linearGradient>
      </defs>

      <rect x="-3" y="-3" width="111" height="74" fill="url(#aris-turf)" />

      {/* Mown stripes, faint enough to sit under the data. */}
      {Array.from({ length: 7 }).map((_, i) => (
        <rect
          key={i}
          x={i * 15}
          y="0"
          width="15"
          height={PITCH_WIDTH}
          fill={i % 2 === 0 ? "rgba(148,163,184,0.028)" : "transparent"}
        />
      ))}

      {children}

      <g stroke="#e2e8f0" strokeOpacity="0.32" strokeWidth="0.3" fill="none">
        <rect x="0" y="0" width={PITCH_LENGTH} height={PITCH_WIDTH} />
        <line x1="52.5" y1="0" x2="52.5" y2={PITCH_WIDTH} />
        <circle cx="52.5" cy="34" r="9.15" />

        {/* Penalty areas, goal areas and the D. */}
        <rect x="0" y="13.84" width="16.5" height="40.32" />
        <rect x="88.5" y="13.84" width="16.5" height="40.32" />
        <rect x="0" y="24.84" width="5.5" height="18.32" />
        <rect x="99.5" y="24.84" width="5.5" height="18.32" />
        <path d="M 16.5 26.73 A 9.15 9.15 0 0 1 16.5 41.27" />
        <path d="M 88.5 26.73 A 9.15 9.15 0 0 0 88.5 41.27" />

        {/* Corner arcs. */}
        <path d="M 0 1 A 1 1 0 0 0 1 0" />
        <path d="M 104 0 A 1 1 0 0 0 105 1" />
        <path d="M 105 67 A 1 1 0 0 0 104 68" />
        <path d="M 1 68 A 1 1 0 0 0 0 67" />

        {/* Goals. */}
        <rect x="-2" y="30.34" width="2" height="7.32" strokeOpacity="0.45" />
        <rect x="105" y="30.34" width="2" height="7.32" strokeOpacity="0.45" />
      </g>

      <g fill="#e2e8f0" fillOpacity="0.36">
        <circle cx="52.5" cy="34" r="0.5" />
        <circle cx="11" cy="34" r="0.5" />
        <circle cx="94" cy="34" r="0.5" />
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * Heat field
 * ------------------------------------------------------------------ */

export interface HeatPoint {
  x: number;
  y: number;
  intensity: number;
}

/** Steps of the ramp, low to high. Deep green through to the brand gold. */
const RAMP = [
  { at: 0.0, fill: "rgba(21,128,61,0)" },
  { at: 0.18, fill: "rgba(21,128,61,0.34)" },
  { at: 0.42, fill: "rgba(34,197,94,0.44)" },
  { at: 0.68, fill: "rgba(132,204,22,0.52)" },
  { at: 1.0, fill: "rgba(234,184,76,0.66)" },
];

function rampFill(v: number) {
  for (let i = RAMP.length - 1; i >= 0; i--) if (v >= RAMP[i].at) return RAMP[i].fill;
  return RAMP[0].fill;
}

export const heatLegend = RAMP.slice(1).map((step) => step.fill);

const COLS = 26;
const ROWS = 17;

/**
 * Bins the point cloud into a grid and blurs it, which is what turns a pile of
 * overlapping translucent circles into a field you can actually read.
 */
export function HeatField({ points }: { points: HeatPoint[] }) {
  const cellW = PITCH_LENGTH / COLS;
  const cellH = PITCH_WIDTH / ROWS;
  const grid = new Float32Array(COLS * ROWS);

  for (const point of points) {
    const col = Math.min(COLS - 1, Math.max(0, Math.floor(point.x / cellW)));
    const row = Math.min(ROWS - 1, Math.max(0, Math.floor(point.y / cellH)));
    grid[row * COLS + col] += point.intensity;
  }

  let peak = 0;
  for (const value of grid) if (value > peak) peak = value;
  if (peak === 0) return null;

  return (
    <g filter="url(#aris-heat)">
      {Array.from(grid, (value, i) => {
        if (value === 0) return null;
        return (
          <rect
            key={i}
            x={(i % COLS) * cellW}
            y={Math.floor(i / COLS) * cellH}
            width={cellW}
            height={cellH}
            fill={rampFill(value / peak)}
          />
        );
      })}
    </g>
  );
}

/** The recommended diagonal, drawn as the corridor the adherence figure measures. */
export function DiagonalCorridor({ halfWidth = 9 }: { halfWidth?: number }) {
  const top = `M 0 ${corridorY(0) - halfWidth} L ${PITCH_LENGTH} ${corridorY(PITCH_LENGTH) - halfWidth}`;
  const bottom = `M 0 ${corridorY(0) + halfWidth} L ${PITCH_LENGTH} ${corridorY(PITCH_LENGTH) + halfWidth}`;
  return (
    <g>
      <path
        d={`${top} L ${PITCH_LENGTH} ${corridorY(PITCH_LENGTH) + halfWidth} L 0 ${corridorY(0) + halfWidth} Z`}
        fill="rgba(226,232,240,0.03)"
      />
      <path d={top} stroke="rgba(226,232,240,0.22)" strokeWidth="0.22" strokeDasharray="2 2" fill="none" />
      <path d={bottom} stroke="rgba(226,232,240,0.22)" strokeWidth="0.22" strokeDasharray="2 2" fill="none" />
    </g>
  );
}
