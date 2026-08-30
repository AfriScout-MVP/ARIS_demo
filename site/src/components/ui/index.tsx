"use client";

import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * Surfaces
 * ------------------------------------------------------------------ */

export function Card({
  children,
  className,
  interactive = false,
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
  padded?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-line bg-ink-2",
        padded && "p-4 sm:p-5",
        interactive && "lift",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 mb-4", className)}>
      <div className="min-w-0">
        <h2 className="font-display text-[15px] font-semibold text-chalk">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[12.5px] leading-snug text-chalk-faint">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** A pitch marking used as a section rule. */
export function ChalkRule({ className }: { className?: string }) {
  return <div className={cn("chalk-rule", className)} />;
}

/* ------------------------------------------------------------------ *
 * Badges — colour only where the Laws assign meaning
 * ------------------------------------------------------------------ */

export type Tone = "neutral" | "pitch" | "amber" | "red" | "var" | "chalk";

const toneClass: Record<Tone, string> = {
  neutral: "border-line bg-white/[0.04] text-chalk-dim",
  pitch: "border-pitch/30 bg-pitch/10 text-pitch",
  amber: "border-amber/30 bg-amber/10 text-amber",
  red: "border-card-red/30 bg-card-red/10 text-card-red",
  var: "border-var/30 bg-var/10 text-var",
  chalk: "border-pitch bg-pitch text-[#04140c]",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ tone = "neutral", pulse = false }: { tone?: Tone; pulse?: boolean }) {
  const fill: Record<Tone, string> = {
    neutral: "bg-chalk-faint",
    pitch: "bg-pitch",
    amber: "bg-amber",
    red: "bg-card-red",
    var: "bg-var",
    chalk: "bg-chalk",
  };
  return <span className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", fill[tone], pulse && "live-dot")} />;
}

/* ------------------------------------------------------------------ *
 * Controls
 * ------------------------------------------------------------------ */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export function Button({ variant = "secondary", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" ? "px-2.5 py-1.5 text-[12px]" : "px-3.5 py-2 text-[13px]",
        variant === "primary" && "bg-pitch text-[#04140c] hover:bg-pitch-soft",
        variant === "secondary" && "border border-line bg-white/[0.03] text-chalk-dim hover:border-line-strong hover:text-chalk",
        variant === "ghost" && "text-chalk-dim hover:bg-white/5 hover:text-chalk",
        variant === "danger" && "border border-card-red/40 bg-card-red/10 text-card-red hover:bg-card-red/20",
        className,
      )}
    />
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-md border border-line bg-ink-1 p-0.5", className)} role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-[5px] px-3 py-1.5 text-[12.5px] font-medium transition-colors",
            value === option.value ? "bg-pitch text-[#04140c]" : "text-chalk-faint hover:text-chalk",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label?: string;
  value: string;
  onChange: (next: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1", className)}>
      {label && <span className="text-[11px] uppercase tracking-wide text-chalk-faint">{label}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-md border border-line bg-ink-1 px-3 py-2 text-[13px] text-chalk outline-none hover:border-line-strong"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-ink-1">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/* ------------------------------------------------------------------ *
 * Data display
 * ------------------------------------------------------------------ */

/**
 * The added-time board. Reserved for the numbers a view exists to show —
 * one primary per screen, the rest quiet.
 */
export function Board({
  label,
  value,
  unit,
  delta,
  hint,
  primary = false,
  tone = "chalk",
  className,
}: {
  label: string;
  value: string | number;
  unit?: string;
  delta?: number;
  hint?: string;
  primary?: boolean;
  tone?: "chalk" | "pitch" | "amber" | "red" | "var";
  className?: string;
}) {
  const valueTone = {
    chalk: "text-chalk",
    pitch: "text-pitch",
    amber: "text-amber",
    red: "text-card-red",
    var: "text-var",
  }[tone];

  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-ink-2 p-4",
        primary && "bg-ink-3 border-line-strong",
        className,
      )}
    >
      <p className="text-[11px] uppercase tracking-[0.08em] text-chalk-faint">{label}</p>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className={cn("board font-semibold", primary ? "text-[34px] leading-none" : "text-[26px] leading-none", valueTone)}>
          {value}
        </span>
        {unit && <span className="text-[12px] text-chalk-faint">{unit}</span>}
      </p>
      {delta !== undefined && (
        <p className={cn("mt-1.5 text-[12px] tnum", delta >= 0 ? "text-pitch" : "text-card-red")}>
          {delta >= 0 ? "+" : "−"}
          {Math.abs(delta).toFixed(1)}
        </p>
      )}
      {hint && <p className="mt-1.5 text-[12px] leading-snug text-chalk-faint">{hint}</p>}
    </div>
  );
}

export function Meter({
  value,
  max = 100,
  tone = "chalk",
  className,
}: {
  value: number;
  max?: number;
  tone?: "chalk" | "pitch" | "amber" | "red" | "var";
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const fill = {
    chalk: "bg-chalk",
    pitch: "bg-pitch",
    amber: "bg-amber",
    red: "bg-card-red",
    var: "bg-var",
  }[tone];
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ScoreRing({
  value,
  size = 60,
  label,
  className,
}: {
  value: number;
  size?: number;
  label?: string;
  className?: string;
}) {
  const stroke = size >= 80 ? 5 : 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const colour = value >= 88 ? "#22c55e" : value >= 78 ? "#eab308" : "#ef4444";

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(148,163,184,0.2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colour}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute flex flex-col items-center leading-none">
        <span className="board font-semibold text-chalk" style={{ fontSize: size * 0.27 }}>
          {value.toFixed(0)}
        </span>
        {label && <span className="mt-0.5 text-[8px] uppercase tracking-wide text-chalk-faint">{label}</span>}
      </span>
    </div>
  );
}

export function Avatar({
  initials,
  size = 32,
  tone = "neutral",
  className,
}: {
  initials: string;
  size?: number;
  tone?: "neutral" | "chalk";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md font-medium",
        tone === "chalk" ? "bg-pitch text-[#04140c]" : "border border-line bg-ink-3 text-chalk-dim",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials}
    </span>
  );
}

export function EmptyState({
  title,
  hint,
  action,
  className,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-lg border border-dashed border-line px-6 py-10 text-center", className)}>
      <p className="text-[13.5px] font-medium text-chalk-dim">{title}</p>
      {hint && <p className="max-w-sm text-[12.5px] text-chalk-faint">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Column label for dense tables. */
export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        "whitespace-nowrap px-3 py-2 text-left text-[10.5px] font-medium uppercase tracking-[0.08em] text-chalk-faint",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-3 py-2.5 text-[13px] text-chalk-dim", className)}>{children}</td>;
}
