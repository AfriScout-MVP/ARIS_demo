"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { Check } from "@/components/icons/glyphs";
import { EASE } from "./motion";

/** Each module card's small moving picture. They start once the card is on screen. */
export type ArtKind = "calendar" | "designations" | "assessments" | "decisions" | "development" | "discipline" | "finance" | "analytics";

const view = { once: true, amount: 0.5 } as const;

export function ModuleArt({ kind }: { kind: ArtKind }) {
  switch (kind) {
    case "calendar":
      return <CalendarArt />;
    case "designations":
      return <CrewArt />;
    case "assessments":
      return <GridArt />;
    case "decisions":
      return <TimelineArt />;
    case "development":
      return <RingArt />;
    case "discipline":
      return <CardsArt />;
    case "finance":
      return <FeesArt />;
    case "analytics":
      return <SparkArt />;
  }
}

/** Fixtures land on the month grid one by one, then turn green as they are published. */
function CalendarArt() {
  const cells = Array.from({ length: 21 }, (_, i) => i);
  const lit = new Set([2, 4, 8, 9, 13, 15, 18]);
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {cells.map((i) => (
        <m.span
          key={i}
          className="h-6 rounded-[5px] border border-line bg-ink-3 sm:h-7"
          initial={{ opacity: 0, scale: 0.6 }}
          whileInView={
            lit.has(i)
              ? { opacity: 1, scale: 1, backgroundColor: ["#ef4444", "#ef4444", "#22c55e"], borderColor: "transparent" }
              : { opacity: 1, scale: 1 }
          }
          viewport={view}
          transition={{ delay: i * 0.03, duration: lit.has(i) ? 1.6 : 0.4, ease: EASE }}
        />
      ))}
    </div>
  );
}

/** Three officials drop into the crew slots, each ticked once the checks pass. */
function CrewArt() {
  const crew = [
    { i: "KH", r: "ARB" },
    { i: "AK", r: "AA1" },
    { i: "MD", r: "AA2" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {crew.map((c, n) => (
        <div key={c.r} className="slot-empty relative grid place-items-center rounded-xl py-3">
          <m.span
            className="grid h-10 w-10 place-items-center rounded-full bg-red-600 text-xs font-bold text-white shadow-[0_8px_20px_-8px_rgb(239_68_68/0.9)]"
            initial={{ y: -30, opacity: 0, scale: 0.6 }}
            whileInView={{ y: 0, opacity: 1, scale: 1 }}
            viewport={view}
            transition={{ delay: 0.2 + n * 0.25, type: "spring", stiffness: 300, damping: 16 }}
          >
            {c.i}
          </m.span>
          <span className="mono mt-1.5 text-[10px] text-chalk-faint">{c.r}</span>
          <m.span
            className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-green-500 text-white"
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={view}
            transition={{ delay: 0.8 + n * 0.25, type: "spring", stiffness: 500, damping: 14 }}
          >
            <Check size={10} strokeWidth={3} />
          </m.span>
        </div>
      ))}
    </div>
  );
}

/** The six weighted criteria fill to their marks. */
function GridArt() {
  const bars = [86, 72, 91, 64, 80, 77];
  return (
    <div className="space-y-1.5">
      {bars.map((v, i) => (
        <div key={i} className="h-2 overflow-hidden rounded-full bg-ink-3">
          <m.div
            className="h-full rounded-full bg-gradient-to-r from-red-500 to-amber-400"
            initial={{ width: 0 }}
            whileInView={{ width: `${v}%` }}
            viewport={view}
            transition={{ delay: i * 0.1, duration: 1.1, ease: EASE }}
          />
        </div>
      ))}
    </div>
  );
}

/** Key decisions tick along the 90 minutes; the VAR review pulses blue. */
function TimelineArt() {
  const ticks = [8, 23, 37, 52, 68, 81];
  const varAt = 3;
  return (
    <div className="relative h-14">
      <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
      <m.div
        className="absolute left-0 top-1/2 h-px bg-red-500"
        initial={{ width: 0 }}
        whileInView={{ width: "100%" }}
        viewport={view}
        transition={{ duration: 1.8, ease: "linear" }}
      />
      {ticks.map((p, i) => (
        <m.span
          key={p}
          className={`absolute top-1/2 -ml-1.5 -mt-1.5 h-3 w-3 rounded-full ${i === varAt ? "bg-blue-500 shadow-[0_0_0_4px_rgb(96_165_250/0.25)]" : "bg-green-500"}`}
          style={{ left: `${p}%` }}
          initial={{ scale: 0 }}
          whileInView={{ scale: i === varAt ? [0, 1.5, 1] : 1 }}
          viewport={view}
          transition={{ delay: (p / 100) * 1.8, duration: 0.4 }}
        />
      ))}
      <span className="mono absolute bottom-0 left-0 text-[10px] text-chalk-faint">0&apos;</span>
      <span className="mono absolute bottom-0 right-0 text-[10px] text-chalk-faint">90&apos;</span>
    </div>
  );
}

/** A licence's validity ring draws to its share. */
function RingArt() {
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 48 48" className="h-16 w-16 -rotate-90" aria-hidden>
        <circle cx="24" cy="24" r="20" fill="none" stroke="var(--ink-3)" strokeWidth="5" />
        <m.circle
          cx="24"
          cy="24"
          r="20"
          fill="none"
          stroke="#22c55e"
          strokeWidth="5"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 0.78 }}
          viewport={view}
          transition={{ duration: 1.4, ease: EASE }}
        />
      </svg>
      <div className="space-y-1.5">
        {[70, 52, 86].map((w, i) => (
          <m.div
            key={i}
            className="h-1.5 rounded-full bg-ink-4"
            initial={{ width: 0 }}
            whileInView={{ width: w }}
            viewport={view}
            transition={{ delay: 0.3 + i * 0.12, duration: 0.8, ease: EASE }}
          />
        ))}
      </div>
    </div>
  );
}

/** A yellow, then a red card come out of the pocket. */
function CardsArt() {
  return (
    <div className="flex h-16 items-end justify-center gap-3 [perspective:400px]">
      {["bg-amber-400", "bg-red-500"].map((c, i) => (
        <m.span
          key={c}
          className={`h-14 w-10 rounded-md ${c} shadow-[0_10px_20px_-10px_rgb(0_0_0/0.6)]`}
          initial={{ y: 40, rotateY: 90, opacity: 0 }}
          whileInView={{ y: 0, rotateY: 0, rotate: i ? 8 : -8, opacity: 1 }}
          viewport={view}
          transition={{ delay: 0.2 + i * 0.35, type: "spring", stiffness: 200, damping: 14 }}
        />
      ))}
    </div>
  );
}

/** A crew's fees in the federations' own currencies (FCFA in West and Central Africa) — the platform's default scale. */
function FeesArt() {
  const reduce = useReducedMotion();
  const rows = [
    { role: "ARB · L1", cur: "XOF", amount: "60 000" },
    { role: "AA1 · L1", cur: "XOF", amount: "40 000" },
    { role: "ARB · L1", cur: "XAF", amount: "60 000" },
    { role: "ARB · CAF", cur: "XOF", amount: "150 000" },
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setI((n) => (n + 1) % rows.length), 1800);
    return () => clearInterval(id);
  }, [reduce, rows.length]);
  const r = rows[i];
  return (
    <div className="flex items-center justify-between rounded-xl border border-line bg-ink-3 px-4 py-3">
      <span className="mono text-xs text-chalk-faint">{r.role}</span>
      <span className="relative h-7 overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          <m.span
            key={i}
            className="board block text-xl text-chalk"
            initial={{ y: 28, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -28, opacity: 0 }}
            transition={{ duration: 0.45, ease: EASE }}
          >
            {r.amount} <span className="mono text-xs text-gold-soft">{r.cur}</span>
          </m.span>
        </AnimatePresence>
      </span>
    </div>
  );
}

/** A rating line draws upward and its last point pulses. */
function SparkArt() {
  return (
    <svg viewBox="0 0 220 64" preserveAspectRatio="none" className="h-16 w-full overflow-visible" aria-hidden>
      <defs>
        <linearGradient id="la-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ef4444" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ef4444" stopOpacity="0" />
        </linearGradient>
      </defs>
      <m.path
        d="M0 52 L30 46 L60 49 L90 34 L120 38 L150 22 L180 26 L218 8 L218 64 L0 64 Z"
        fill="url(#la-fill)"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={view}
        transition={{ delay: 0.8, duration: 0.8 }}
      />
      <m.path
        d="M0 52 L30 46 L60 49 L90 34 L120 38 L150 22 L180 26 L218 8"
        fill="none"
        stroke="#ef4444"
        strokeWidth="2.5"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={view}
        transition={{ duration: 1.4, ease: EASE }}
      />
      <m.circle cx="218" cy="8" r="4.5" fill="#ef4444" className="hidden" initial={{ scale: 0 }} whileInView={{ scale: [0, 1.6, 1] }} viewport={view} transition={{ delay: 1.4, duration: 0.5 }} />
    </svg>
  );
}
