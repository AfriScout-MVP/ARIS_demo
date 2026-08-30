/**
 * The pitch is drawn the way it is marked: line markings on a dark slate
 * ground. The surface stays neutral so the green presence map and the coloured
 * decision markers on top of it are the only things that read as data.
 */
export function Pitch({ children }: { children?: React.ReactNode }) {
  return (
    <svg viewBox="0 0 100 64" className="h-full w-full" preserveAspectRatio="none">
      <rect x="0" y="0" width="100" height="64" fill="#0f172a" />
      {Array.from({ length: 6 }).map((_, i) => (
        <rect
          key={i}
          x={i * 16.667}
          y="0"
          width="16.667"
          height="64"
          fill={i % 2 === 0 ? "rgba(148,163,184,0.035)" : "transparent"}
        />
      ))}
      <g stroke="#cbd5e1" strokeOpacity="0.3" strokeWidth="0.35" fill="none">
        <rect x="1.5" y="1.5" width="97" height="61" />
        <line x1="50" y1="1.5" x2="50" y2="62.5" />
        <circle cx="50" cy="32" r="8.5" />
        <rect x="1.5" y="14" width="15" height="36" />
        <rect x="83.5" y="14" width="15" height="36" />
        <rect x="1.5" y="24" width="5.5" height="16" />
        <rect x="93" y="24" width="5.5" height="16" />
      </g>
      <circle cx="50" cy="32" r="0.7" fill="#cbd5e1" fillOpacity="0.35" />
      <circle cx="12" cy="32" r="0.7" fill="#cbd5e1" fillOpacity="0.35" />
      <circle cx="88" cy="32" r="0.7" fill="#cbd5e1" fillOpacity="0.35" />
      {children}
    </svg>
  );
}
