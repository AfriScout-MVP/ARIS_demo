"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * Tints — one set of colour tokens, shared by counters, cards and chips
 * so the same meaning is the same colour on every screen.
 * ------------------------------------------------------------------ */

export type Tint = "slate" | "pitch" | "amber" | "red" | "var" | "gold";

interface TintTokens {
  /** Card surface + border. */
  surface: string;
  /** A wash for a full-width panel, lighter than a counter tile. */
  wash: string;
  /** The number, or any text that carries the tint. */
  text: string;
  /** The label above the number. */
  label: string;
  /** Icon chip behind a Lucide glyph. */
  chip: string;
  /** Solid fill, for meters and rails. */
  fill: string;
}

export const tints: Record<Tint, TintTokens> = {
  slate: {
    surface: "border-line bg-ink-2",
    wash: "border-line bg-ink-2",
    text: "text-chalk",
    label: "text-chalk-dim",
    chip: "bg-red-500/10 text-red-500",
    fill: "bg-chalk-faint",
  },
  pitch: {
    surface: "border-emerald-500/25 bg-emerald-500/10",
    wash: "border-emerald-500/20 bg-linear-to-b from-emerald-500/[0.07] to-ink-2",
    text: "text-pitch",
    label: "text-chalk-dim",
    chip: "bg-emerald-500/15 text-pitch",
    fill: "bg-pitch",
  },
  amber: {
    surface: "border-amber-500/25 bg-amber-500/10",
    wash: "border-amber-500/20 bg-linear-to-b from-amber-500/[0.07] to-ink-2",
    text: "text-amber",
    label: "text-chalk-dim",
    chip: "bg-amber-500/15 text-amber",
    fill: "bg-amber",
  },
  red: {
    surface: "border-rose-500/25 bg-rose-500/10",
    wash: "border-rose-500/20 bg-linear-to-b from-rose-500/[0.07] to-ink-2",
    text: "text-card-red",
    label: "text-chalk-dim",
    chip: "bg-rose-500/15 text-card-red",
    fill: "bg-card-red",
  },
  var: {
    surface: "border-blue-500/25 bg-blue-500/10",
    wash: "border-blue-500/20 bg-linear-to-b from-blue-500/[0.07] to-ink-2",
    text: "text-var",
    label: "text-chalk-dim",
    chip: "bg-blue-500/15 text-var",
    fill: "bg-var",
  },
  gold: {
    surface: "border-yellow-600/25 bg-yellow-600/10",
    wash: "border-yellow-600/20 bg-linear-to-b from-yellow-600/[0.07] to-ink-2",
    text: "text-gold-soft",
    label: "text-chalk-dim",
    chip: "bg-yellow-600/15 text-gold-soft",
    fill: "bg-gold-soft",
  },
};

/* ------------------------------------------------------------------ *
 * Surfaces
 * ------------------------------------------------------------------ */

export function Card({
  children,
  className,
  interactive = false,
  padded = true,
  tint,
}: {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
  padded?: boolean;
  /** Washes the panel in one meaning's colour. Use on the panel a page is about. */
  tint?: Tint;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border",
        tint ? tints[tint].wash : "border-line bg-ink-2",
        padded && "p-4 sm:p-6",
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
  icon: Icon,
  tint = "slate",
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  icon?: LucideIcon;
  tint?: Tint;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-start justify-between gap-x-3 gap-y-2", className)}>
      <div className="flex min-w-0 flex-1 basis-40 items-start gap-2.5">
        {Icon && (
          <span
            className={cn(
              "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
              tints[tint].chip,
            )}
          >
            <Icon size={16} />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-chalk">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm leading-snug text-chalk-dim">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="max-w-full shrink-0 [&>span]:whitespace-normal">{action}</div>}
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

export type Tone = "neutral" | "pitch" | "amber" | "red" | "var" | "gold" | "chalk";

const toneClass: Record<Tone, string> = {
  neutral: "border-line bg-wash/[0.04] text-chalk-dim",
  pitch: "border-emerald-500/30 bg-emerald-500/[0.08] text-pitch",
  amber: "border-amber-500/30 bg-amber-500/[0.08] text-amber",
  red: "border-rose-500/30 bg-rose-500/[0.08] text-card-red",
  var: "border-blue-500/30 bg-blue-500/[0.08] text-var",
  gold: "border-yellow-600/30 bg-yellow-600/[0.08] text-gold-soft",
  chalk: "border-pitch bg-pitch text-on-pitch",
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
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold",
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
    gold: "bg-gold-soft",
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
        "inline-flex items-center justify-center gap-1.5 font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" ? "min-h-10 rounded-lg px-3 py-1.5 text-xs sm:min-h-0" : "min-h-10 rounded-xl px-4 py-2.5 text-sm",
        // red-600 → orange-700: the admin's red→orange, deep enough for white
        // 14px text (the 500/500 pair is 2.8–3.8:1).
        variant === "primary" &&
          "bg-linear-to-r from-red-600 to-orange-700 text-white shadow-lg shadow-red-500/20 hover:from-red-700 hover:to-orange-800",
        variant === "secondary" && "border border-field bg-ink-2 text-chalk-dim hover:bg-ink-3 hover:text-chalk",
        variant === "ghost" && "text-chalk-dim hover:bg-red-500/10 hover:text-chalk",
        variant === "danger" && "border border-red-500/30 bg-red-500/10 text-card-red hover:bg-red-500/20",
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
    <div className={cn("inline-flex rounded-xl border border-field bg-ink-2 p-0.5", className)} role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "min-h-9 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            value === option.value ? "bg-red-600 text-white" : "text-chalk-faint hover:text-chalk",
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
      {label && <span className="text-xs font-semibold uppercase tracking-wider text-chalk-dim">{label}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-xl border border-field bg-ink-2 px-3 py-2 text-sm text-chalk outline-none hover:border-red-500/50 focus:border-red-500 focus:ring-2 focus:ring-red-500/50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-ink-2">
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

/** `chalk` is kept as the neutral name so older call sites still read right. */
export type BoardTone = "chalk" | Tint;

/**
 * The added-time board — a counter tile. The tint carries the meaning
 * (green confirmed, amber pending, red unfilled, sky under review, gold
 * catalogue), so a row of these can be read by colour before it is read.
 */
export function Board({
  label,
  value,
  unit,
  delta,
  hint,
  icon: Icon,
  primary = false,
  tone = "chalk",
  className,
}: {
  label: string;
  value: string | number;
  unit?: string;
  delta?: number;
  hint?: string;
  icon?: LucideIcon;
  primary?: boolean;
  tone?: BoardTone;
  className?: string;
}) {
  const tint = tints[tone === "chalk" ? "slate" : tone];

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border p-4 backdrop-blur-sm",
        tint.surface,
        primary && tone === "chalk" && "border-line-strong bg-ink-3",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={cn("hyphens-auto break-words text-[11px] font-semibold uppercase leading-tight tracking-wider", tint.label)}>{label}</p>
        {Icon && (
          <span
            className={cn(
              "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
              tint.chip,
            )}
          >
            <Icon size={13} />
          </span>
        )}
      </div>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span
          className={cn(
            "board font-semibold",
            primary ? "text-4xl leading-none" : "text-2xl leading-none",
            tint.text,
          )}
        >
          {value}
        </span>
        {unit && <span className="text-xs text-chalk-dim">{unit}</span>}
      </p>
      {delta !== undefined && (
        <p className={cn("mt-1.5 text-xs font-semibold tnum", delta >= 0 ? "text-pitch" : "text-card-red")}>
          {delta >= 0 ? "+" : "−"}
          {Math.abs(delta).toFixed(1)}
        </p>
      )}
      {hint && <p className="mt-1.5 text-xs leading-snug text-chalk-dim">{hint}</p>}
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
  tone?: BoardTone;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const fill = tone === "chalk" ? "bg-chalk" : tints[tone].fill;
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-wash/[0.08]", className)}>
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
  const colour = value >= 88 ? "var(--pitch)" : value >= 78 ? "var(--amber)" : "var(--card-red)";

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" style={{ stroke: "var(--line)" }} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          style={{ stroke: colour }}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute flex flex-col items-center leading-none">
        <span className="board text-chalk" style={{ fontSize: size * 0.27 }}>
          {value.toFixed(0)}
        </span>
        {label && <span className="mt-0.5 text-[10px] uppercase tracking-wide text-chalk-faint">{label}</span>}
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
        "inline-flex shrink-0 items-center justify-center rounded-full font-medium",
        tone === "chalk"
          ? "bg-linear-to-br from-red-600 to-orange-700 text-white"
          : "border border-line bg-ink-3 text-chalk-dim",
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
    <div className={cn("flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-6 py-10 text-center", className)}>
      <p className="text-sm font-medium text-chalk-dim">{title}</p>
      {hint && <p className="max-w-sm text-sm text-chalk-faint">{hint}</p>}
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
        "whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-chalk-dim",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("whitespace-nowrap px-4 py-3 text-sm text-chalk dark:text-chalk-dim", className)}>{children}</td>;
}
