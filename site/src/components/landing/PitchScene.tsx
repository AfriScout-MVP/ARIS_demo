"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { BadgeCheck, TrendingUp, Video } from "@/components/icons/glyphs";
import { useT } from "@/lib/i18n/LocaleProvider";
import { DIAGONAL, H, W, assistantAt, ballAt, formation, keepClear, lerp, metres, playerAt, refereeTarget, type Point } from "@/lib/landing/pitch";
import { EASE } from "./motion";

const HOME = formation("home");
const AWAY = formation("away");
const TRAIL = 42;
/** One VAR check every this many seconds of match time. */
const VAR_EVERY = 11;

/**
 * The hero: a pitch in perspective, drawn in on arrival, with 22 players, the ball, the referee
 * on the diagonal and both assistants on the touchlines, all driven by one animation clock.
 * Positions are written straight to the SVG nodes, so a frame never goes through React.
 * The HUD around it reads live off the same clock (distance to play, minute, VAR checks).
 */
export function PitchScene() {
  const t = useT();
  const reduce = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const distRef = useRef<HTMLSpanElement>(null);
  const minuteRef = useRef<HTMLSpanElement>(null);
  const [varCheck, setVarCheck] = useState(0);

  // pointer tilt
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rx = useSpring(useTransform(py, [-0.5, 0.5], [30, 18]), { stiffness: 90, damping: 18 });
  const ry = useSpring(useTransform(px, [-0.5, 0.5], [-7, 7]), { stiffness: 90, damping: 18 });

  useEffect(() => {
    const el = svg.current;
    const host = root.current;
    if (!el || !host) return;
    const q = (sel: string) => Array.from(el.querySelectorAll<SVGGraphicsElement>(sel));
    const home = q("[data-home]");
    const away = q("[data-away]");
    const ball = el.querySelector<SVGGElement>("[data-ball]")!;
    const ref = el.querySelector<SVGGElement>("[data-ref]")!;
    const ar1 = el.querySelector<SVGGElement>("[data-ar1]")!;
    const ar2 = el.querySelector<SVGGElement>("[data-ar2]")!;
    const trail = el.querySelector<SVGPathElement>("[data-trail]")!;
    const link = el.querySelector<SVGLineElement>("[data-link]")!;

    const move = (g: SVGGraphicsElement, p: Point) => g.setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
    let refPos = refereeTarget(ballAt(8));
    let a1 = assistantAt(ballAt(8), 1);
    let a2 = assistantAt(ballAt(8), 2);
    const points: Point[] = [];
    let lastSample = 0;
    let lastHud = 0;
    let lastVar = 0;

    const paint = (clock: number, dt: number) => {
      const b = ballAt(clock);
      HOME.forEach((base, i) => move(home[i], playerAt(base, i, b, clock)));
      AWAY.forEach((base, i) => move(away[i], playerAt(base, i + 11, b, clock + 3)));
      const k = Math.min(1, dt * 2.4);
      const target = refereeTarget(b);
      refPos = keepClear({ x: lerp(refPos.x, target.x, k), y: lerp(refPos.y, target.y, k) }, b);
      const t1 = assistantAt(b, 1);
      const t2 = assistantAt(b, 2);
      a1 = { x: lerp(a1.x, t1.x, k * 1.3), y: t1.y };
      a2 = { x: lerp(a2.x, t2.x, k * 1.3), y: t2.y };
      move(ball, b);
      move(ref, refPos);
      move(ar1, a1);
      move(ar2, a2);
      link.setAttribute("x1", refPos.x.toFixed(1));
      link.setAttribute("y1", refPos.y.toFixed(1));
      link.setAttribute("x2", b.x.toFixed(1));
      link.setAttribute("y2", b.y.toFixed(1));
      if (clock - lastSample > 0.12) {
        lastSample = clock;
        points.push({ ...refPos });
        if (points.length > TRAIL) points.shift();
        trail.setAttribute("d", points.length ? `M${points.map((p) => `${p.x.toFixed(0)} ${p.y.toFixed(0)}`).join("L")}` : "");
      }
      if (clock - lastHud > 0.25) {
        lastHud = clock;
        if (distRef.current) distRef.current.textContent = String(metres(refPos, b));
        if (minuteRef.current) minuteRef.current.textContent = String(60 + (Math.floor(clock / 4) % 30));
      }
    };

    if (reduce) {
      for (let i = 0; i < 60; i++) paint(8 + i / 30, 1 / 30);
      return;
    }

    let raf = 0;
    let visible = true;
    let prev = performance.now();
    let clock = 8;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      clock += dt;
      paint(clock, dt);
      if (clock - lastVar > VAR_EVERY) {
        lastVar = clock;
        setVarCheck((n) => n + 1);
      }
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (raf || !visible || document.hidden) return;
      prev = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) start();
      else stop();
    });
    io.observe(host);
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVis);
    start();
    return () => {
      stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [reduce]);

  // the VAR banner hides itself a moment after each check
  const [varShown, setVarShown] = useState(false);
  useEffect(() => {
    if (!varCheck) return;
    const on = setTimeout(() => setVarShown(true), 1500);
    const off = setTimeout(() => setVarShown(false), 4600);
    return () => {
      clearTimeout(on);
      clearTimeout(off);
    };
  }, [varCheck]);

  const line = (d: string, i: number) => (
    <m.path
      key={d}
      d={d}
      fill="none"
      stroke="rgb(255 255 255 / 0.55)"
      strokeWidth={3}
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{ duration: 1.4, delay: 0.3 + i * 0.12, ease: EASE }}
    />
  );

  return (
    <div
      ref={root}
      className="relative mx-auto w-full max-w-[640px] [perspective:1600px]"
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse") return;
        const r = e.currentTarget.getBoundingClientRect();
        px.set((e.clientX - r.left) / r.width - 0.5);
        py.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onPointerLeave={() => {
        px.set(0);
        py.set(0);
      }}
      role="img"
      aria-label={t("landing.pitch.label")}
    >
      <m.div
        style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}
        initial={{ opacity: 0, y: 40, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 1.1, ease: EASE }}
        // its own compositor layer: the tilt and the live SVG repaint without dragging the page along
        className="relative will-change-transform"
      >
        <div aria-hidden className="absolute -inset-8 rounded-[48px] bg-[radial-gradient(closest-side,rgb(34_197_94/0.22),transparent)]" />
        <svg ref={svg} viewBox={`-20 -20 ${W + 40} ${H + 40}`} className="relative block w-full overflow-visible rounded-[22px] shadow-[0_40px_80px_-30px_rgb(0_0_0/0.65)]">
          <defs>
            <linearGradient id="lp-grass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0f5a32" />
              <stop offset="1" stopColor="#0a3b22" />
            </linearGradient>
            <linearGradient id="lp-diag" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#ef4444" stopOpacity="0" />
              <stop offset="0.5" stopColor="#ef4444" stopOpacity="0.85" />
              <stop offset="1" stopColor="#ef4444" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="lp-var" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#60a5fa" stopOpacity="0" />
              <stop offset="0.85" stopColor="#60a5fa" stopOpacity="0.45" />
              <stop offset="1" stopColor="#bfdbfe" stopOpacity="0.95" />
            </linearGradient>
            <radialGradient id="lp-glow">
              <stop offset="0" stopColor="#ef4444" stopOpacity="0.55" />
              <stop offset="1" stopColor="#ef4444" stopOpacity="0" />
            </radialGradient>
            <clipPath id="lp-clip">
              <rect x={-20} y={-20} width={W + 40} height={H + 40} rx={22} />
            </clipPath>
          </defs>

          <g clipPath="url(#lp-clip)">
            <rect x={-20} y={-20} width={W + 40} height={H + 40} fill="url(#lp-grass)" />
            {Array.from({ length: 10 }, (_, i) => (
              <rect key={i} x={i * (W / 10)} y={0} width={W / 10} height={H} fill="#ffffff" opacity={i % 2 ? 0.035 : 0} />
            ))}

            {[
              `M0 0H${W}V${H}H0Z`,
              `M${W / 2} 0V${H}`,
              `M${W / 2 + 91.5} ${H / 2}a91.5 91.5 0 1 0 -183 0a91.5 91.5 0 1 0 183 0`,
              `M0 138H165V542H0`,
              `M${W} 138H${W - 165}V542H${W}`,
              `M0 248H55V432H0`,
              `M${W} 248H${W - 55}V432H${W}`,
              `M165 267a91.5 91.5 0 0 1 0 146`,
              `M${W - 165} 267a91.5 91.5 0 0 0 0 146`,
            ].map(line)}
            <circle cx={W / 2} cy={H / 2} r={4} fill="rgb(255 255 255 / 0.6)" />

            {/* the diagonal */}
            <m.line
              x1={DIAGONAL[0].x}
              y1={DIAGONAL[0].y}
              x2={DIAGONAL[1].x}
              y2={DIAGONAL[1].y}
              stroke="url(#lp-diag)"
              strokeWidth={5}
              strokeDasharray="14 12"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.6, delay: 1.2, ease: EASE }}
            />

            {/* VAR sweep */}
            {varCheck > 0 && !reduce && (
              <m.rect
                key={varCheck}
                y={0}
                height={H}
                width={160}
                fill="url(#lp-var)"
                initial={{ x: -180, opacity: 0 }}
                animate={{ x: W + 20, opacity: [0, 1, 1, 0] }}
                transition={{ duration: 1.6, ease: "easeInOut" }}
              />
            )}

            <path data-trail fill="none" stroke="#ef4444" strokeOpacity={0.4} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
            <line data-link stroke="#fecaca" strokeOpacity={0.45} strokeWidth={2} strokeDasharray="4 7" />

            {HOME.map((_, i) => (
              <g key={`h${i}`} data-home>
                <circle r={i === 0 ? 13 : 12} fill={i === 0 ? "#22d3ee" : "#f1f5f9"} stroke="#0f172a" strokeOpacity={0.35} strokeWidth={2} />
              </g>
            ))}
            {AWAY.map((_, i) => (
              <g key={`a${i}`} data-away>
                <circle r={i === 0 ? 13 : 12} fill={i === 0 ? "#a78bfa" : "#eab84c"} stroke="#0f172a" strokeOpacity={0.35} strokeWidth={2} />
              </g>
            ))}

            <g data-ar1>
              <circle r={10} fill="#ef4444" stroke="#fff" strokeWidth={2} />
            </g>
            <g data-ar2>
              <circle r={10} fill="#ef4444" stroke="#fff" strokeWidth={2} />
            </g>
            <g data-ref>
              <circle r={40} fill="url(#lp-glow)" />
              <circle r={15} fill="#ef4444" stroke="#fff" strokeWidth={3} />
              <circle r={15} fill="none" stroke="#ef4444" strokeWidth={2} className="origin-center animate-ping [transform-box:fill-box]" />
            </g>
            <g data-ball>
              <ellipse cx={3} cy={6} rx={8} ry={4} fill="#000" opacity={0.3} />
              <circle r={8} fill="#fff" />
              <path d="M-3 -2l3 -3l3 3l-1 4h-4z" fill="#0f172a" opacity={0.7} />
            </g>
          </g>
        </svg>
      </m.div>

      {/* HUD */}
      <m.div
        className="absolute -top-4 left-2 flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/90 px-3 py-1.5 text-xs font-semibold text-white shadow-lg sm:-left-4"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.6, duration: 0.6, ease: EASE }}
      >
        <span className="live-dot h-2 w-2 rounded-full bg-red-500" />
        {t("landing.pitch.live")}
        <span className="board text-white/80">
          <span ref={minuteRef}>63</span>&apos;
        </span>
      </m.div>

      <Hud className="-right-2 top-6 hidden sm:block lg:-right-10" delay={1.9}>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">{t("landing.pitch.arps")}</p>
        <p className="mt-0.5 flex items-center gap-1.5">
          <span className="board text-2xl text-white">8.6</span>
          <TrendingUp size={15} className="text-green-400" />
        </p>
        <svg viewBox="0 0 80 22" className="mt-1 h-5 w-20" aria-hidden>
          <m.path
            d="M1 18 L14 14 L26 16 L38 9 L50 11 L62 5 L79 3"
            fill="none"
            stroke="#4ade80"
            strokeWidth={2}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 2.2, duration: 1.4, ease: EASE }}
          />
        </svg>
      </Hud>

      <Hud className="-left-2 bottom-16 hidden sm:block lg:-left-12" delay={2.2} float={-1}>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">{t("landing.pitch.distance")}</p>
        <p className="board mt-0.5 text-2xl text-white">
          <span ref={distRef}>12</span>
          <span className="ml-0.5 text-sm text-white/60">m</span>
        </p>
      </Hud>

      <Hud className="-bottom-6 right-4 lg:-right-6" delay={2.5}>
        <p className="flex items-center gap-2 text-xs font-semibold text-white">
          <BadgeCheck size={15} className="text-green-400" />
          {t("landing.pitch.crew")}
        </p>
        <div className="mt-1.5 flex -space-x-1.5">
          {["KH", "AK", "MD"].map((x, i) => (
            <m.span
              key={x}
              className="grid h-7 w-7 place-items-center rounded-full border-2 border-slate-900 bg-red-600 text-[10px] font-bold text-white"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 2.8 + i * 0.15, type: "spring", stiffness: 400, damping: 14 }}
            >
              {x}
            </m.span>
          ))}
        </div>
      </Hud>

      <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center">
        <AnimatePresence>
          {varShown && (
            <m.div
              key={varCheck}
              className="flex items-center gap-2 rounded-xl border border-blue-400/40 bg-slate-950/95 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_40px_-8px_rgb(96_165_250/0.8)]"
              initial={{ opacity: 0, scale: 0.8, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -12 }}
              transition={{ type: "spring", stiffness: 320, damping: 22 }}
            >
              <Video size={16} className="text-blue-400" />
              {t("landing.pitch.var")}
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Hud({ children, className, delay, float = 1 }: { children: React.ReactNode; className?: string; delay: number; float?: 1 | -1 }) {
  const reduce = useReducedMotion();
  return (
    <m.div
      // no backdrop blur: these float over a picture that changes every frame, so a blur would be recomputed every frame
      className={`absolute rounded-2xl border border-white/10 bg-slate-950/90 px-3.5 py-2.5 shadow-[0_20px_40px_-20px_rgb(0_0_0/0.8)] ${className ?? ""}`}
      initial={{ opacity: 0, scale: 0.85, y: 16 }}
      animate={reduce ? { opacity: 1, scale: 1, y: 0 } : { opacity: 1, scale: 1, y: [0, -8 * float, 0] }}
      transition={{
        opacity: { delay, duration: 0.6 },
        scale: { delay, duration: 0.6, ease: EASE },
        y: { delay, duration: 5, repeat: Infinity, ease: "easeInOut" },
      }}
    >
      {children}
    </m.div>
  );
}
