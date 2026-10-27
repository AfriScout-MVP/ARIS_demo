import { cn } from "@/lib/utils";
import { MARK_A, MARK_BALL, MARK_DIAGONAL, MARK_GOLD } from "./Mark";

/**
 * The ARIS mark, drawn live: the A's outline traces in and fills, the referee's diagonal cuts across
 * it, and the ball lands with a ripple — then the ink runs off and the loop starts again.
 *
 * Pure SVG + CSS (`.aris-loader` in globals.css), so it costs nothing to ship and runs before any
 * script has hydrated. Under `prefers-reduced-motion` it holds still as the finished mark.
 *
 * `tile` sets it on the red cut-corner tile with a slow halo; without it, the bare glyph in
 * `currentColor` for inline use.
 */
export function MarkLoader({ size = 56, tile = true, className }: { size?: number; tile?: boolean; className?: string }) {
  const glyph = (
    <svg viewBox={tile ? "0 0 512 512" : "56 60 408 408"} width={size} height={size} aria-hidden className="relative overflow-visible">
      <path className="ld-a" pathLength={1} d={MARK_A} fill="currentColor" stroke="currentColor" strokeWidth="14" strokeLinejoin="round" />
      <path className="ld-diag" pathLength={1} d={MARK_DIAGONAL} stroke="currentColor" strokeWidth="40" fill="none" />
      <circle className="ld-ripple" {...MARK_BALL} fill="none" stroke={MARK_GOLD} strokeWidth="10" />
      <circle className="ld-ball" {...MARK_BALL} fill={MARK_GOLD} />
    </svg>
  );

  if (!tile) return <span className={cn("aris-loader inline-flex", className)}>{glyph}</span>;

  return (
    <span className={cn("aris-loader relative inline-flex shrink-0 items-center justify-center", className)} style={{ width: size, height: size }}>
      <span aria-hidden className="ld-halo absolute inset-[-35%] rounded-full" />
      <span
        className="ld-tile relative inline-flex h-full w-full items-center justify-center bg-red-600 text-white"
        style={{ clipPath: "polygon(0 0, 72% 0, 100% 28%, 100% 100%, 0 100%)" }}
      >
        <span aria-hidden className="ld-sheen absolute inset-0" />
        <span className="absolute inset-0">{glyph}</span>
      </span>
    </span>
  );
}

/** A full-screen wait: the loader, a line of copy and a thin running bar. */
export function LoadingScreen({ label }: { label: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      <MarkLoader size={64} />
      <div className="w-48">
        <p className="ld-label text-sm font-medium text-chalk-dim" role="status">
          {label}
        </p>
        <span aria-hidden className="ld-bar mt-3 block h-[2px] overflow-hidden rounded-full bg-line">
          <span className="block h-full w-1/3 rounded-full bg-red-500" />
        </span>
      </div>
    </main>
  );
}
