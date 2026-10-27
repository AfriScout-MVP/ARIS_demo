"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";
import {
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Check,
  ClipboardCheck,
  Globe2,
  GraduationCap,
  History,
  KeyRound,
  Landmark,
  Menu,
  Moon,
  Scale,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sun,
  Users,
  Video,
  Whistle,
  X,
  Zap,
  Banknote,
  type IconType,
} from "@/components/icons/glyphs";
import { Mark, MarkTile } from "@/components/icons/Mark";
import { LoginForm } from "@/components/auth/LoginScreen";
import { LocaleToggle } from "@/components/layout/LocaleToggle";
import { useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { useTheme } from "@/lib/theme/ThemeProvider";
import { countryName, feedEntries, fetchPublicSummary, type PublicSummary } from "@/lib/landing/federations";
import { cn } from "@/lib/utils";
import type { TKey } from "@/locales";
import { ModuleArt, type ArtKind } from "./ModuleArt";
import { Counter, EASE, Magnetic, Reveal, Spotlight, WordsRise } from "./motion";
import { PitchScene } from "./PitchScene";

const SECTIONS = ["modules", "workflow", "roles", "security"] as const;

/**
 * The public face of ARIS: what a signed-out visitor sees at `/`. Everything is static and
 * translated; signing in happens in a panel over the page, and on success the data gate swaps
 * this whole tree for the app.
 */
export function Landing() {
  // only ever rendered in the browser (the data gate decides first), so reading the hash here is safe
  const [signIn, setSignIn] = useState(() => typeof window !== "undefined" && window.location.hash === "#signin");

  const open = useCallback(() => setSignIn(true), []);
  const summary = usePublicSummary();

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <div className="relative overflow-x-clip">
          <Header onSignIn={open} />
          <main id="top">
            <Hero onSignIn={open} />
            <Federations summary={summary} />
            <Figures summary={summary} />
            <Modules />
            <Workflow />
            <Roles />
            <Security summary={summary} />
            <Languages />
            <FinalCall onSignIn={open} />
          </main>
          <Footer />
          <SignInSheet open={signIn} onClose={() => setSignIn(false)} />
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}

/** The live countries and counts; null until the API answers (and if it never does, those sections stay hidden). */
function usePublicSummary() {
  const [summary, setSummary] = useState<PublicSummary | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    fetchPublicSummary(ctrl.signal).then(setSummary, () => {});
    return () => ctrl.abort();
  }, []);
  return summary;
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ─── chrome ─────────────────────────────────────────────────────────────── */

function ThemeButton() {
  const t = useT();
  const { theme, toggle } = useTheme();
  const label = t(theme === "dark" ? "landing.nav.themeLight" : "landing.nav.themeDark");
  return (
    <button type="button" onClick={toggle} title={label} aria-label={label} className="grid h-10 w-10 place-items-center rounded-lg text-chalk-dim transition-colors hover:bg-red-500/10 hover:text-chalk">
      <AnimatePresence mode="wait" initial={false}>
        <m.span key={theme} initial={{ rotate: -90, opacity: 0, scale: 0.6 }} animate={{ rotate: 0, opacity: 1, scale: 1 }} exit={{ rotate: 90, opacity: 0, scale: 0.6 }} transition={{ duration: 0.25 }}>
          {theme === "dark" ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} />}
        </m.span>
      </AnimatePresence>
    </button>
  );
}

function Header({ onSignIn }: { onSignIn: () => void }) {
  const t = useT();
  const { scrollY } = useScroll();
  const [solid, setSolid] = useState(false);
  const [menu, setMenu] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setSolid(y > 12));

  return (
    <header className={cn("fixed inset-x-0 top-0 z-50 transition-all duration-300", solid ? "border-b border-line bg-ink-0/90 backdrop-blur-md" : "border-b border-transparent")}>
      <a href="#top" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded-lg focus:bg-red-600 focus:px-3 focus:py-2 focus:text-white">
        {t("landing.skip")}
      </a>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <a href="#top" className="group flex items-center gap-2.5 text-chalk">
          <m.span whileHover={{ rotate: -8, scale: 1.06 }} transition={{ type: "spring", stiffness: 400, damping: 12 }}>
            <MarkTile size={34} />
          </m.span>
          <span className="font-display text-lg font-extrabold tracking-[-0.03em]">{t("common.appName")}</span>
        </a>

        <nav className="hidden items-center gap-1 md:flex" aria-label={t("landing.nav.menu")}>
          {SECTIONS.map((s) => (
            <button key={s} type="button" onClick={() => scrollToId(s)} className="group relative rounded-lg px-3 py-2 text-sm text-chalk-dim transition-colors hover:text-chalk">
              {t(`landing.nav.${s}` as TKey)}
              <span className="absolute inset-x-3 bottom-1 h-px origin-left scale-x-0 bg-red-500 transition-transform duration-300 group-hover:scale-x-100" />
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <div className="hidden sm:block">
            <LocaleToggle />
          </div>
          <ThemeButton />
          <button
            type="button"
            onClick={onSignIn}
            className="ml-1 hidden h-10 items-center gap-1.5 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white shadow-[0_6px_14px_-8px_rgba(185,28,28,0.8)] transition-colors hover:bg-red-700 sm:inline-flex"
          >
            {t("landing.nav.signIn")}
          </button>
          <button type="button" onClick={() => setMenu((v) => !v)} aria-expanded={menu} aria-label={t("landing.nav.menu")} className="grid h-10 w-10 place-items-center rounded-lg text-chalk-dim md:hidden">
            {menu ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {menu && (
          <m.nav
            className="border-t border-line bg-ink-0 px-4 pb-5 pt-2 md:hidden"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            {SECTIONS.map((s, i) => (
              <m.button
                key={s}
                type="button"
                className="block w-full rounded-lg px-2 py-3 text-left text-base text-chalk"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * i }}
                onClick={() => {
                  setMenu(false);
                  scrollToId(s);
                }}
              >
                {t(`landing.nav.${s}` as TKey)}
              </m.button>
            ))}
            <div className="mt-3 flex items-center gap-2">
              <LocaleToggle />
              <button
                type="button"
                onClick={() => {
                  setMenu(false);
                  onSignIn();
                }}
                className="h-11 flex-1 rounded-lg bg-red-600 text-sm font-semibold text-white"
              >
                {t("landing.nav.signIn")}
              </button>
            </div>
          </m.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

/* ─── hero ───────────────────────────────────────────────────────────────── */

function Hero({ onSignIn }: { onSignIn: () => void }) {
  const t = useT();
  const proofs = [
    { icon: Globe2, key: "landing.hero.proof1" },
    { icon: ShieldCheck, key: "landing.hero.proof2" },
    { icon: History, key: "landing.hero.proof3" },
  ] as const;

  return (
    // the hero sits on the page backdrop itself: no blurred, drifting colour behind the headline
    <section className="relative isolate overflow-hidden pt-28 sm:pt-32 lg:min-h-[100svh] lg:pt-36">
      <div aria-hidden className="chalk-field absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_top,#000_30%,transparent_75%)]" />

      <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 pb-20 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
        <div>
          <m.p className="eyebrow" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, ease: EASE }}>
            {t("landing.hero.eyebrow")}
          </m.p>
          <h1 className="mt-5 font-display text-[clamp(2.1rem,9vw,4.4rem)] font-extrabold leading-[1.02] text-chalk hyphens-auto">
            <WordsRise text={t("landing.hero.titleA")} delay={0.1} />
            <br />
            <WordsRise text={t("landing.hero.titleB")} delay={0.35} wordClassName="text-accent" />
          </h1>
          <m.p
            className="mt-6 max-w-xl text-base leading-relaxed text-chalk-dim sm:text-lg"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.8, ease: EASE }}
          >
            {t("landing.hero.lead")}
          </m.p>
          <m.div className="mt-8 flex flex-wrap items-center gap-3" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, duration: 0.7, ease: EASE }}>
            <Magnetic>
              <button
                type="button"
                onClick={onSignIn}
                className="group relative inline-flex h-12 items-center gap-2 overflow-hidden rounded-xl bg-red-600 px-6 text-sm font-semibold text-white shadow-[0_14px_30px_-12px_rgba(220,38,38,0.9)] transition-colors hover:bg-red-700"
              >
                <span aria-hidden className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                {t("landing.hero.primary")}
                <ArrowUpRight size={16} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </button>
            </Magnetic>
            <button
              type="button"
              onClick={() => scrollToId("modules")}
              className="inline-flex h-12 items-center gap-2 rounded-xl border border-line bg-ink-2 px-6 text-sm font-semibold text-chalk transition-colors hover:border-line-strong hover:bg-ink-3"
            >
              {t("landing.hero.secondary")}
            </button>
          </m.div>
          <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-3">
            {proofs.map(({ icon: Icon, key }, i) => (
              <m.li
                key={key}
                className="flex items-center gap-2 text-sm text-chalk-dim"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.1 + i * 0.12, duration: 0.6, ease: EASE }}
              >
                <Icon size={16} className="text-pitch" />
                {t(key)}
              </m.li>
            ))}
          </ul>
        </div>
        <div className="px-2 sm:px-6 lg:px-0">
          <PitchScene />
        </div>
      </div>
    </section>
  );
}

/* ─── federations marquee ────────────────────────────────────────────────── */

export function Federations({ summary }: { summary: PublicSummary | null }) {
  const t = useT();
  const { locale } = useLocale();
  if (!summary?.countries.length) return null;
  return (
    <section className="relative border-y border-line bg-ink-1/60 py-14">
      <Reveal className="mx-auto max-w-3xl px-4 text-center">
        <h2 className="font-display text-2xl font-bold text-chalk sm:text-3xl">{t("landing.federations.title", { count: summary.countries.length })}</h2>
        <p className="mt-3 text-chalk-dim">{t("landing.federations.lead")}</p>
      </Reveal>
      <div className="mx-auto mt-10 flex max-w-6xl flex-wrap justify-center gap-4 px-4">
        {summary.countries.map((c, i) => (
          <Reveal key={c.code} delay={i * 0.08} className="w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc((100%-2rem)/3)]">
            <Spotlight
              as="div"
              className="flex h-full items-center gap-4 rounded-2xl border border-line bg-ink-2 py-3 pl-3 pr-4 shadow-sm transition-colors hover:border-red-500/40"
            >
              {c.flagUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- static export, a small public SVG from the API
                <img src={c.flagUrl} alt="" width={48} height={36} loading="lazy" className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-black/10" />
              ) : (
                <span aria-hidden className="mono grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink-4 text-[11px] text-chalk-dim">{c.iso2}</span>
              )}
              <span className="min-w-0">
                <span className="block font-semibold text-chalk">{countryName(c, locale)}</span>
                {c.federationName && <span className="block text-xs text-chalk-dim">{c.federationName}</span>}
              </span>
              {c.federation && <span className="mono ml-auto rounded-md bg-ink-4 px-1.5 py-0.5 text-[11px] text-chalk-faint">{c.federation}</span>}
            </Spotlight>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ─── figures ────────────────────────────────────────────────────────────── */

export function Figures({ summary }: { summary: PublicSummary | null }) {
  const t = useT();
  if (!summary) return null;
  const f = summary.figures;
  const items = [
    { value: f.countries, key: "landing.stats.countries" },
    { value: f.officials, key: "landing.stats.officials" },
    { value: f.competitions, key: "landing.stats.competitions" },
    { value: f.criteria, key: "landing.stats.criteria" },
  ] as const;
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-line bg-line lg:grid-cols-4">
        {items.map((it, i) => (
          <Reveal key={it.key} delay={i * 0.08} className="bg-ink-0">
            <div className="group relative h-full p-6 sm:p-8">
              <span aria-hidden className="absolute left-0 top-0 h-[3px] w-0 bg-red-500 transition-all duration-500 group-hover:w-full" />
              <Counter value={it.value} className="board block text-5xl text-chalk sm:text-6xl" />
              <p className="mt-2 text-sm text-chalk-dim hyphens-auto">{t(it.key)}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ─── modules ────────────────────────────────────────────────────────────── */

const MODULES: { key: ArtKind; icon: IconType; span: string }[] = [
  { key: "calendar", icon: CalendarDays, span: "lg:col-span-2" },
  { key: "designations", icon: Users, span: "lg:col-span-2" },
  { key: "assessments", icon: ClipboardCheck, span: "" },
  { key: "decisions", icon: Video, span: "" },
  { key: "development", icon: GraduationCap, span: "" },
  { key: "discipline", icon: ShieldAlert, span: "" },
  { key: "finance", icon: Banknote, span: "lg:col-span-2" },
  { key: "analytics", icon: BarChart3, span: "lg:col-span-2" },
];

function SectionHead({ eyebrow, title, lead, center = false }: { eyebrow: string; title: string; lead?: string; center?: boolean }) {
  return (
    <Reveal className={cn("max-w-3xl", center && "mx-auto text-center")}>
      <p className={cn("eyebrow", center && "justify-center")}>{eyebrow}</p>
      <h2 className="mt-4 font-display text-[clamp(1.75rem,6vw,3rem)] font-extrabold leading-[1.08] text-chalk hyphens-auto">{title}</h2>
      {lead && <p className="mt-4 text-base leading-relaxed text-chalk-dim sm:text-lg">{lead}</p>}
    </Reveal>
  );
}

function Modules() {
  const t = useT();
  return (
    <section id="modules" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-20 sm:px-6 lg:py-28">
      <SectionHead eyebrow={t("landing.modules.eyebrow")} title={t("landing.modules.title")} lead={t("landing.modules.lead")} />
      <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {MODULES.map(({ key, icon: Icon, span }, i) => (
          <m.li
            key={key}
            className={span}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.7, delay: (i % 4) * 0.08, ease: EASE }}
          >
            <Spotlight className="panel group flex h-full flex-col justify-between gap-6 rounded-3xl border border-line bg-ink-2 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-red-500/40">
              <div>
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-red-500/10 text-red-500 transition-transform duration-300 group-hover:rotate-[-8deg] group-hover:scale-110">
                  <Icon size={20} />
                </span>
                <h3 className="mt-4 text-lg font-bold text-chalk">{t(`landing.modules.${key}.title` as TKey)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-chalk-dim">{t(`landing.modules.${key}.body` as TKey)}</p>
              </div>
              <ModuleArt kind={key} />
            </Spotlight>
          </m.li>
        ))}
      </ul>
    </section>
  );
}

/* ─── workflow ───────────────────────────────────────────────────────────── */

const STEPS: { key: string; icon: IconType }[] = [
  { key: "plan", icon: CalendarDays },
  { key: "appoint", icon: Users },
  { key: "officiate", icon: Whistle },
  { key: "assess", icon: ClipboardCheck },
  { key: "develop", icon: GraduationCap },
];

function Workflow() {
  const t = useT();
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.45"] });
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 24 });
  return (
    <section id="workflow" className="relative scroll-mt-20 overflow-hidden border-y border-line bg-ink-1/60 py-20 lg:py-28">
      <div aria-hidden className="chalk-field absolute inset-0 -z-10 opacity-60" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHead eyebrow={t("landing.workflow.eyebrow")} title={t("landing.workflow.title")} lead={t("landing.workflow.lead")} center />
        <ol ref={ref} className="relative mt-16 grid gap-10 lg:grid-cols-5 lg:gap-6">
          {/* the rail: vertical on phones, horizontal on desktop */}
          <span aria-hidden className="absolute bottom-0 left-[23px] top-0 w-px bg-line lg:left-0 lg:right-0 lg:top-[23px] lg:h-px lg:w-auto" />
          <m.span aria-hidden style={{ scaleY: progress }} className="absolute bottom-0 left-[23px] top-0 w-px origin-top bg-gradient-to-b from-red-500 via-amber-400 to-green-500 lg:hidden" />
          <m.span aria-hidden style={{ scaleX: progress }} className="absolute left-0 right-0 top-[23px] hidden h-px origin-left bg-gradient-to-r from-red-500 via-amber-400 to-green-500 lg:block" />
          {STEPS.map(({ key, icon: Icon }, i) => (
            <Step key={key} index={i} progress={progress}>
              <span className="relative z-10 grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-line bg-ink-2 text-chalk shadow-sm">
                <Icon size={20} />
                <span className="board absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-red-600 text-[10px] text-white">{i + 1}</span>
              </span>
              <div>
                <h3 className="text-lg font-bold text-chalk">{t(`landing.workflow.${key}.title` as TKey)}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-chalk-dim">{t(`landing.workflow.${key}.body` as TKey)}</p>
              </div>
            </Step>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Step({ children, index, progress }: { children: React.ReactNode; index: number; progress: ReturnType<typeof useSpring> }) {
  const at = index / (STEPS.length - 1);
  const opacity = useTransform(progress, [Math.max(0, at - 0.25), at], [0.35, 1]);
  const scale = useTransform(progress, [Math.max(0, at - 0.25), at], [0.96, 1]);
  return (
    <m.li style={{ opacity, scale }} className="relative flex gap-5 lg:flex-col lg:gap-5">
      {children}
    </m.li>
  );
}

/* ─── roles ──────────────────────────────────────────────────────────────── */

const ROLES: { key: "admin" | "federation" | "referee"; icon: IconType; tint: string }[] = [
  { key: "admin", icon: Shield, tint: "from-red-600 to-red-500" },
  { key: "federation", icon: Landmark, tint: "from-amber-500 to-amber-400" },
  { key: "referee", icon: Whistle, tint: "from-green-600 to-green-500" },
];

function Roles() {
  const t = useT();
  return (
    <section id="roles" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-20 sm:px-6 lg:py-28">
      <SectionHead eyebrow={t("landing.roles.eyebrow")} title={t("landing.roles.title")} />
      <div className="mt-14 grid gap-5 md:grid-cols-3">
        {ROLES.map(({ key, icon: Icon, tint }, i) => (
          <m.article
            key={key}
            initial={{ opacity: 0, y: 40, rotateX: 12 }}
            whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.8, delay: i * 0.12, ease: EASE }}
            whileHover={{ y: -6 }}
            className="panel group relative overflow-hidden rounded-3xl border border-line bg-ink-2 p-7"
          >
            <span aria-hidden className={cn("absolute -right-16 -top-16 h-44 w-44 rounded-full bg-gradient-to-br opacity-20 blur-2xl transition-opacity duration-500 group-hover:opacity-40", tint)} />
            <span className={cn("grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-lg", tint)}>
              <Icon size={22} />
            </span>
            <h3 className="mt-5 text-xl font-bold text-chalk">{t(`landing.roles.${key}.title`)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-chalk-dim">{t(`landing.roles.${key}.body`)}</p>
            <ul className="mt-5 space-y-2.5">
              {(["p1", "p2", "p3"] as const).map((p, j) => (
                <m.li
                  key={p}
                  className="flex items-center gap-2.5 text-sm text-chalk"
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.4 + i * 0.12 + j * 0.1, duration: 0.5 }}
                >
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-pitch/15 text-pitch">
                    <Check size={12} strokeWidth={3} />
                  </span>
                  {t(`landing.roles.${key}.${p}`)}
                </m.li>
              ))}
            </ul>
          </m.article>
        ))}
      </div>
    </section>
  );
}

/* ─── security ───────────────────────────────────────────────────────────── */

const TRUST: { key: string; icon: IconType }[] = [
  { key: "scope", icon: ShieldCheck },
  { key: "audit", icon: History },
  { key: "sessions", icon: KeyRound },
  { key: "edge", icon: Zap },
];

function Security({ summary }: { summary: PublicSummary | null }) {
  const t = useT();
  // illustrative entries — the real log's action names, attributed to the live federations
  const FEED = feedEntries(summary?.countries ?? []);
  return (
    <section id="security" className="relative scroll-mt-20 overflow-hidden border-y border-line bg-ink-1/60 py-20 lg:py-28">
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2">
        <div>
          <SectionHead eyebrow={t("landing.security.eyebrow")} title={t("landing.security.title")} lead={t("landing.security.lead")} />
          <ul className="mt-10 grid gap-4 sm:grid-cols-2">
            {TRUST.map(({ key, icon: Icon }, i) => (
              <Reveal key={key} delay={i * 0.08}>
                <Spotlight as="div" className="h-full rounded-2xl border border-line bg-ink-2 p-5 transition-colors hover:border-red-500/40">
                  <Icon size={20} className="text-red-500" />
                  <h3 className="mt-3 font-bold text-chalk">{t(`landing.security.${key}.title` as TKey)}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-chalk-dim">{t(`landing.security.${key}.body` as TKey)}</p>
                </Spotlight>
              </Reveal>
            ))}
          </ul>
        </div>

        <Reveal delay={0.15}>
          <div className="relative mx-auto max-w-md">
            <div aria-hidden className="absolute -inset-8 rounded-[40px] bg-[radial-gradient(closest-side,rgb(239_68_68/0.18),transparent)] blur-2xl" />
            <div className="panel relative overflow-hidden rounded-3xl border border-line bg-ink-2">
              <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
                <span className="flex items-center gap-2 text-sm font-semibold text-chalk">
                  <History size={16} className="text-red-500" />
                  audit_log
                </span>
                <span className="flex items-center gap-1.5 text-xs text-chalk-faint">
                  <span className="live-dot h-1.5 w-1.5 rounded-full bg-green-500" />
                  {t("landing.pitch.live")}
                </span>
              </div>
              <div className="relative h-72 overflow-hidden [mask-image:linear-gradient(transparent,#000_18%,#000_82%,transparent)]">
                <ul className="animate-[feed_16s_linear_infinite] space-y-2 p-4 motion-reduce:animate-none">
                  {[...FEED, ...FEED].map((e, i) => (
                    <li key={i} aria-hidden={i >= FEED.length} className="flex items-center gap-3 rounded-xl border border-line bg-ink-3/60 px-3 py-2.5">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-red-500/10 text-red-500">
                        <Scale size={13} />
                      </span>
                      <span className="mono min-w-0 flex-1 truncate text-xs text-chalk">{e.action}</span>
                      <span className="mono rounded-md bg-ink-4 px-1.5 py-0.5 text-[10px] text-chalk-dim">{e.who}</span>
                      <span className="mono text-[10px] text-chalk-faint">{e.at}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            {/* the country wall */}
            <m.div
              className="absolute -bottom-6 -left-6 flex items-center gap-2 rounded-2xl border border-line bg-ink-2 px-4 py-3 shadow-xl"
              initial={{ opacity: 0, scale: 0.8, rotate: -6 }}
              whileInView={{ opacity: 1, scale: 1, rotate: -3 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5, type: "spring", stiffness: 200, damping: 16 }}
            >
              <ShieldCheck size={18} className="text-pitch" />
              <span className="mono text-xs text-chalk">MAR ≠ GHA</span>
            </m.div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ─── languages ──────────────────────────────────────────────────────────── */

const WORDS = [
  { word: "Arbitre", lang: "FR" },
  { word: "Referee", lang: "EN" },
  { word: "Árbitro", lang: "ES" },
  { word: "Schiedsrichter", lang: "DE" },
];

function Languages() {
  const t = useT();
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setI((n) => (n + 1) % WORDS.length), 2200);
    return () => clearInterval(id);
  }, [reduce]);
  const w = WORDS[i];
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 text-center sm:px-6 lg:py-28">
      <SectionHead eyebrow={t("landing.languages.eyebrow")} title={t("landing.languages.title")} lead={t("landing.languages.lead")} center />
      <div className="relative mx-auto mt-12 flex h-24 max-w-3xl items-center justify-center overflow-hidden sm:h-32" aria-hidden>
        <AnimatePresence mode="popLayout" initial={false}>
          <m.span
            key={w.word}
            className="font-display text-[clamp(2rem,10vw,6rem)] font-extrabold text-chalk"
            initial={{ y: "100%", opacity: 0, filter: "blur(10px)" }}
            animate={{ y: "0%", opacity: 1, filter: "blur(0px)" }}
            exit={{ y: "-100%", opacity: 0, filter: "blur(10px)" }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            {w.word}
            <sup className="mono ml-2 align-super text-sm font-medium text-red-500 sm:text-base">{w.lang}</sup>
          </m.span>
        </AnimatePresence>
      </div>
      <div className="mt-6 flex justify-center gap-2">
        {WORDS.map((x, j) => (
          <span key={x.lang} className={cn("h-1.5 rounded-full transition-all duration-500", j === i ? "w-8 bg-red-500" : "w-1.5 bg-line-strong")} />
        ))}
      </div>
    </section>
  );
}

/* ─── final call ─────────────────────────────────────────────────────────── */

function FinalCall({ onSignIn }: { onSignIn: () => void }) {
  const t = useT();
  return (
    <section className="px-4 pb-24 sm:px-6">
      <Reveal className="mx-auto max-w-7xl">
        <div className="relative isolate overflow-hidden rounded-[32px] bg-red-600 px-6 py-16 text-center text-white sm:px-16 sm:py-24">
          <div aria-hidden className="absolute inset-0 -z-10 bg-[repeating-linear-gradient(135deg,rgb(255_255_255/0.07)_0_2px,transparent_2px_26px)]" />
          {/* still light and shade in the red itself: gradients, no blur, nothing moving */}
          <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_70%_at_0%_0%,rgb(255_255_255/0.16),transparent_70%),radial-gradient(ellipse_60%_70%_at_100%_100%,rgb(127_29_29/0.55),transparent_70%)]" />
          <m.div
            aria-hidden
            className="mx-auto mb-8 w-fit text-white/90"
            initial={{ rotate: -20, scale: 0.6, opacity: 0 }}
            whileInView={{ rotate: 0, scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 160, damping: 12 }}
          >
            <Mark size={56} />
          </m.div>
          <h2 className="mx-auto max-w-3xl font-display text-[clamp(1.75rem,6vw,3rem)] font-extrabold leading-tight hyphens-auto">{t("landing.cta.title")}</h2>
          <p className="mx-auto mt-4 max-w-xl text-white/85 sm:text-lg">{t("landing.cta.lead")}</p>
          <Magnetic className="mt-9">
            <button
              type="button"
              onClick={onSignIn}
              className="group inline-flex h-13 items-center gap-2 rounded-xl bg-white px-7 py-3.5 text-sm font-bold text-red-700 shadow-[0_18px_40px_-14px_rgb(0_0_0/0.55)] transition-transform hover:scale-[1.03]"
            >
              {t("landing.cta.button")}
              <ArrowUpRight size={16} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </button>
          </Magnetic>
        </div>
      </Reveal>
    </section>
  );
}

/* ─── footer ─────────────────────────────────────────────────────────────── */

function Footer() {
  const t = useT();
  return (
    <footer className="border-t border-line bg-ink-1/60">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <MarkTile size={40} />
          <div>
            <p className="font-display text-lg font-extrabold leading-none text-chalk">{t("common.appName")}</p>
            <p className="mt-1.5 text-xs text-chalk-faint">{t("landing.footer.tagline")}</p>
          </div>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label={t("landing.nav.menu")}>
          {SECTIONS.map((s) => (
            <button key={s} type="button" onClick={() => scrollToId(s)} className="text-sm text-chalk-dim transition-colors hover:text-chalk">
              {t(`landing.nav.${s}` as TKey)}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <LocaleToggle />
          <ThemeButton />
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-5 text-xs text-chalk-faint sm:flex-row sm:justify-between sm:px-6">
          <p>{t("landing.footer.rights", { year: new Date().getFullYear() })}</p>
          <p>{t("landing.footer.flags")}</p>
        </div>
      </div>
    </footer>
  );
}

/* ─── sign-in panel ──────────────────────────────────────────────────────── */

function SignInSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !panel.current) return;
      // keep Tab inside the panel
      const f = panel.current.querySelectorAll<HTMLElement>("button, input, select, a[href], [tabindex]:not([tabindex='-1'])");
      const list = Array.from(f).filter((el) => !el.hasAttribute("disabled"));
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6">
          <m.div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <m.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={t("auth.title")}
            className="relative w-full max-w-md rounded-t-3xl border border-line bg-ink-1 p-6 shadow-2xl sm:rounded-3xl"
            initial={{ y: 60, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
          >
            <div className="mb-5 flex items-center justify-between">
              <span className="flex items-center gap-2.5">
                <MarkTile size={36} />
                <span>
                  <span className="block font-display text-base font-extrabold leading-none text-chalk">{t("common.appName")}</span>
                  <span className="mt-1 block text-[11px] leading-none text-chalk-faint">{t("common.by")}</span>
                </span>
              </span>
              <button type="button" onClick={onClose} aria-label={t("common.close")} className="grid h-10 w-10 place-items-center rounded-lg text-chalk-dim hover:bg-red-500/10 hover:text-chalk">
                <X size={18} />
              </button>
            </div>
            <LoginForm autoFocus className="space-y-4" />
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );
}
