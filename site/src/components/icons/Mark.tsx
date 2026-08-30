/**
 * The ARIS mark: a pitch rectangle with the referee's diagonal drawn across it.
 * The diagonal is the one line every referee is taught to hold, and the one
 * metric this product keeps coming back to.
 */
export function Mark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2" stroke="currentColor" strokeWidth="1.4" opacity="0.55" />
      <path d="M12 4.5v15" stroke="currentColor" strokeWidth="1.1" opacity="0.35" />
      <path
        d="M5.2 17.6 18.8 6.4"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <circle cx="5.2" cy="17.6" r="1.7" fill="currentColor" />
      <circle cx="18.8" cy="6.4" r="1.7" fill="currentColor" />
    </svg>
  );
}
