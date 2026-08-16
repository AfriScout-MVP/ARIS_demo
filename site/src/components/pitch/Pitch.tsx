export function Pitch({ children }: { children?: React.ReactNode }) {
  return (
    <svg viewBox="0 0 100 64" className="w-full h-full" preserveAspectRatio="none">
      <rect x="0" y="0" width="100" height="64" fill="#0a3d24" />
      {Array.from({ length: 10 }).map((_, i) => (
        <rect key={i} x={i * 10} y="0" width="10" height="64" fill={i % 2 === 0 ? "#0c4529" : "#0a3d24"} />
      ))}
      <g stroke="#eef3f8" strokeOpacity="0.35" strokeWidth="0.4" fill="none">
        <rect x="1" y="1" width="98" height="62" />
        <line x1="50" y1="1" x2="50" y2="63" />
        <circle cx="50" cy="32" r="9" />
        <circle cx="50" cy="32" r="0.6" fill="#eef3f8" fillOpacity="0.35" />
        <rect x="1" y="14" width="16" height="36" />
        <rect x="83" y="14" width="16" height="36" />
        <rect x="1" y="24" width="6" height="16" />
        <rect x="93" y="24" width="6" height="16" />
      </g>
      {children}
    </svg>
  );
}
