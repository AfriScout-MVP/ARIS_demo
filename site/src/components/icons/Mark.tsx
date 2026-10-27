/**
 * The ARIS mark: a heavy "A" whose crossbar is the referee's diagonal — bottom-left to top-right, the
 * diagonal system of control — ending in the ball. Drawn on a 512 grid; the tile cuts its top-right
 * corner on the same 45° line the diagonal runs along.
 */
export const MARK_A = "M206 90H306L442 430H354L256 185L158 430H70Z";
export const MARK_DIAGONAL = "M140 376L412 184";
export const MARK_BALL = { cx: 412, cy: 184, r: 46 };
export const MARK_TILE = "M0 0H368.6L512 143.4V512H0Z";
/** The ball's gold: bright enough to hold on the red tile and on dark ink. */
export const MARK_GOLD = "#fbbf24";

/** The glyph alone, in `currentColor` (the ball stays gold), framed to its own bounds. */
export function Mark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="56 60 408 408" className={className} aria-hidden>
      <path d={MARK_A} fill="currentColor" />
      <path d={MARK_DIAGONAL} stroke="currentColor" strokeWidth="40" fill="none" />
      <circle {...MARK_BALL} fill={MARK_GOLD} />
    </svg>
  );
}

/** The mark on its tile: solid red, the top-right corner cut off — the app icon and favicon. */
export function MarkTile({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" className={`shrink-0 ${className ?? ""}`} aria-hidden>
      <path d={MARK_TILE} fill="#dc2626" />
      <path d={MARK_A} fill="#ffffff" />
      <path d={MARK_DIAGONAL} stroke="#ffffff" strokeWidth="40" fill="none" />
      <circle {...MARK_BALL} fill={MARK_GOLD} />
    </svg>
  );
}
