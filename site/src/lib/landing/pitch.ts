/**
 * The hero pitch's choreography, as pure functions of time — the component only paints them.
 *
 * Units: decimetres on a 105 × 68 m pitch, so the field is 1050 × 680 and 10 units = 1 m.
 * Home attacks to the right. The referee works the classic diagonal system: they run the line
 * from the bottom-left to the top-right corner area, stepping off it toward play, while the
 * two assistants patrol opposite halves of opposite touchlines.
 */

export const W = 1050;
export const H = 680;

export type Point = { x: number; y: number };

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** The ball: two slow sweeps plus a quicker wobble, so it never repeats a visible loop. */
export function ballAt(t: number): Point {
  const x = W / 2 + 360 * Math.sin(t * 0.31) * Math.cos(t * 0.09) + 70 * Math.sin(t * 1.17);
  const y = H / 2 + 215 * Math.sin(t * 0.47 + 1) * Math.cos(t * 0.06) + 40 * Math.cos(t * 1.41);
  return { x: clamp(x, 40, W - 40), y: clamp(y, 30, H - 30) };
}

/** 4-3-3 for the home side, by line; the away side mirrors it. */
const HOME: Point[] = [
  { x: 55, y: 340 },
  { x: 230, y: 120 },
  { x: 205, y: 270 },
  { x: 205, y: 410 },
  { x: 230, y: 560 },
  { x: 380, y: 200 },
  { x: 355, y: 340 },
  { x: 380, y: 480 },
  { x: 520, y: 150 },
  { x: 545, y: 340 },
  { x: 520, y: 530 },
];

export const formation = (side: "home" | "away"): Point[] => (side === "home" ? HOME : HOME.map((p) => ({ x: W - p.x, y: H - p.y })));

/** A player: their base spot, pulled toward the ball (keepers barely), with a personal sway. */
export function playerAt(base: Point, index: number, ball: Point, t: number): Point {
  const keeper = index === 0;
  const pull = keeper ? 0.08 : 0.34;
  const swayX = keeper ? 4 : 16 * Math.sin(t * (0.8 + index * 0.07) + index * 1.9);
  const swayY = keeper ? 18 * Math.sin(t * 0.9 + index) : 14 * Math.cos(t * (0.7 + index * 0.05) + index * 2.3);
  const x = base.x + (ball.x - W / 2) * pull + swayX;
  const y = base.y + (ball.y - H / 2) * pull * 0.7 + swayY;
  return { x: clamp(x, keeper ? 12 : 30, keeper ? W - 12 : W - 30), y: clamp(y, 20, H - 20) };
}

/** The diagonal the referee keeps to: bottom-left penalty area to top-right penalty area. */
export const DIAGONAL: [Point, Point] = [
  { x: 170, y: 600 },
  { x: 880, y: 80 },
];

/** Where on the diagonal the ball "is": its orthogonal projection, clamped to the segment. */
export function projectOnDiagonal(p: Point): Point {
  const [a, b] = DIAGONAL;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const k = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
  return { x: a.x + dx * k, y: a.y + dy * k };
}

/** The referee's target: on the diagonal, stepped toward play, but never on top of it (≥ 9 m). */
export function refereeTarget(ball: Point): Point {
  const on = projectOnDiagonal(ball);
  const toward = { x: lerp(on.x, ball.x, 0.3), y: lerp(on.y, ball.y, 0.3) };
  const d = Math.hypot(ball.x - toward.x, ball.y - toward.y);
  if (d >= 90 || d === 0) return toward;
  const k = 90 / d;
  return { x: ball.x + (toward.x - ball.x) * k, y: ball.y + (toward.y - ball.y) * k };
}

/** Pushes the referee back out to the 9 m ring if the ball has run onto them. */
export function keepClear(ref: Point, ball: Point): Point {
  const d = Math.hypot(ref.x - ball.x, ref.y - ball.y);
  if (d >= 90) return ref;
  if (d === 0) return { x: ball.x - 90, y: ball.y };
  const k = 90 / d;
  return { x: ball.x + (ref.x - ball.x) * k, y: ball.y + (ref.y - ball.y) * k };
}

/** Assistants: AR1 on the top touchline, right half; AR2 on the bottom touchline, left half. */
export function assistantAt(ball: Point, which: 1 | 2): Point {
  return which === 1 ? { x: clamp(ball.x + 40, W / 2, W - 10), y: 6 } : { x: clamp(ball.x - 40, 10, W / 2), y: H - 6 };
}

/** Pitch units to whole metres. */
export const metres = (a: Point, b: Point) => Math.round(Math.hypot(a.x - b.x, a.y - b.y) / 10);
