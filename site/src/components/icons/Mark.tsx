/**
 * The ARIS mark: the corner arc of a pitch with the referee's diagonal cut
 * across it. The diagonal is the line every referee is taught to hold, and the
 * one metric this product keeps coming back to; the arc is where it starts.
 */
export function Mark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M3 3v18h18" stroke="currentColor" strokeWidth="1.5" opacity="0.45" />
      <path d="M10 21a7 7 0 0 0-7-7" stroke="currentColor" strokeWidth="1.7" />
      <path d="M7.5 16.5 19 5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" />
      <circle cx="19.5" cy="4.5" r="2.1" fill="currentColor" />
    </svg>
  );
}

/**
 * The mark on its tile: solid accent, one corner cut off, so the tile itself
 * is as recognisable as the glyph in it.
 */
export function MarkTile({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center bg-red-600 text-white ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        clipPath: "polygon(0 0, calc(100% - 28%) 0, 100% 28%, 100% 100%, 0 100%)",
      }}
    >
      <Mark size={Math.round(size * 0.58)} />
    </span>
  );
}
