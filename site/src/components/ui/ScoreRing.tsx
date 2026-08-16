import { cn } from "@/lib/utils";

export function ScoreRing({
  value,
  size = 64,
  strokeWidth = 6,
  label,
  className,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  className?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const color = value >= 88 ? "#17c778" : value >= 75 ? "#e2b13c" : "#ef4453";

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#1c2837" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className="font-display font-semibold text-aris-text" style={{ fontSize: size * 0.26 }}>
          {value.toFixed(0)}
        </span>
        {label && <span className="text-[9px] uppercase tracking-wide text-aris-muted">{label}</span>}
      </div>
    </div>
  );
}
