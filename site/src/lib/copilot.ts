// ARIS Copilot.
//
// It answers from the same in-memory data every other screen reads, and returns
// the rows it used so the answer can be checked. It never produces a number
// that is not already on a row somewhere in the product — when a question falls
// outside that, it says so instead of guessing.
//
// Every sentence goes through the translation files (`copilot.a.*`), so the answers
// exist in all four languages. Questions are matched against keywords of every language.

import { bestCandidate, candidatesForSlot } from "./assignment";
import type { Locale, TKey } from "@/locales";
import { translate, type Vars } from "./i18n/translate";
import { pickLocalized } from "./i18n/localized";
import {
  assessments,
  availabilityFor,
  CAF,
  competitionById,
  countries,
  countryName,
  crewIsComplete,
  daysBetween,
  fitnessTests,
  fixtures,
  licenceStatus,
  licences,
  matchById,
  openSlots,
  refereeById,
  referees,
  refereeHref,
  today,
  weekStarts,
  workloadFor,
  WORKLOAD_HEAVY,
  zoneKey,
  zones,
} from "./store";

export interface AnswerRow {
  label: string;
  meta: string;
  href?: string;
  /** Country whose flag is drawn in front of the label. */
  flag?: string;
}

export interface Answer {
  headline: string;
  detail?: string;
  rows: AnswerRow[];
  /** Which screen this answer came from, so the user can go check it. */
  sourceLabel: string;
  sourceHref: string;
}

const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

function has(q: string, ...terms: string[]) {
  return terms.some((term) => q.includes(term));
}

/** Example questions built from what is actually in scope — never from fixed names. */
export function suggestions(locale: Locale, codes: string[]): string[] {
  const t = (key: TKey, vars?: Vars) => translate(locale, key, vars);
  const out: string[] = [];
  const upcoming = fixtures.filter((f) => !f.played && codes.includes(f.countryCode)).sort((a, b) => b.importance - a.importance)[0];
  if (upcoming) out.push(t("copilot.s.reco", { match: `${upcoming.home} — ${upcoming.away}` }));
  out.push(t("copilot.s.licences"), t("copilot.s.gaps"));
  const withReferees = countries.find((c) => codes.includes(c.code) && referees.some((r) => r.countryCode === c.code));
  if (withReferees) out.push(t("copilot.s.top", { country: countryName(withReferees.code, locale) }));
  out.push(t("copilot.s.form"), t("copilot.s.fitness"), t("copilot.s.workload"));
  const zone = zones.find((z) => countries.some((c) => c.zone === z && codes.includes(c.code)));
  if (zone) out.push(t("copilot.s.zone", { zone }));
  return out;
}

export function ask(question: string, locale: Locale, codes: string[]): Answer | null {
  const q = strip(question);
  const t = (key: TKey, vars?: Vars) => translate(locale, key, vars);
  const inScope = (code: string) => code === CAF || codes.includes(code);
  const risk = (r: "low" | "medium" | "high") =>
    t(r === "low" ? "arae.riskLow" : r === "medium" ? "arae.riskMedium" : "arae.riskHigh").toLowerCase();

  /* ---- Who should referee <fixture> ---------------------------------- */
  if (has(q, "who should", "qui devrait", "recommend", "recommande", "designer", "designate", "appoint", "arbitrer", "quien deberia", "recomienda", "designar", "wer soll", "empfehl", "pfeifen", "ansetzen")) {
    const upcoming = fixtures.filter((f) => !f.played && inScope(f.countryCode));
    const named = upcoming.find((f) =>
      [f.home, f.away, competitionById.get(f.competitionId)?.name ?? ""].some((name) =>
        strip(name).split(/\s+/).some((word) => word.length > 3 && q.includes(word)),
      ),
    );
    const fixture = named ?? upcoming.sort((a, b) => b.importance - a.importance)[0];
    if (!fixture) return null;

    const ranked = candidatesForSlot(fixture, "R", fixture.crew).filter((c) => c.blockers.length === 0);
    const pick = ranked[0];
    if (!pick) return null;

    return {
      headline: t("copilot.a.recoHead", { name: pick.name, match: `${fixture.home} — ${fixture.away}` }),
      detail: t("copilot.a.recoDetail", {
        rating: pick.rating.toFixed(0),
        rest: pick.rest,
        travel: pick.travelHours,
        risk: risk(pick.frictionRisk),
        n: ranked.length,
      }),
      rows: ranked.slice(0, 5).map((c, i) => ({
        label: `${i + 1}. ${c.name}`,
        flag: c.countryCode,
        meta: t("copilot.a.recoRow", { score: c.score.toFixed(0), rest: c.rest, travel: c.travelHours }),
        href: refereeHref(c.id),
      })),
      sourceLabel: t("nav.arae"),
      sourceHref: "/arae",
    };
  }

  /* ---- Licences ------------------------------------------------------ */
  if (has(q, "licence", "license", "expire", "expiring", "renew", "renouvel", "certification", "licencia", "caducan", "vencen", "lizenz", "ablauf", "laufen")) {
    const window = /(\d{2,3})/.exec(q);
    const horizon = window ? Number(window[1]) : 90;
    const due = licences
      .filter((l) => {
        const referee = refereeById.get(l.refereeId);
        if (!referee || !codes.includes(referee.countryCode)) return false;
        const status = licenceStatus(l);
        return status.state === "expired" || status.days <= horizon;
      })
      .sort((a, b) => a.expires.localeCompare(b.expires));

    return {
      headline: t("copilot.a.licHead", { n: due.length, days: horizon }),
      detail: t("copilot.a.licDetail"),
      rows: due.slice(0, 8).flatMap((l) => {
        const referee = refereeById.get(l.refereeId);
        if (!referee) return [];
        const status = licenceStatus(l);
        return [
          {
            label: `${referee.name} — ${l.kind}`,
            flag: referee.countryCode,
            meta:
              status.state === "expired"
                ? t("copilot.a.licExpired", { n: Math.abs(status.days) })
                : t("copilot.a.licExpires", { n: status.days }),
            href: refereeHref(referee.id),
          },
        ];
      }),
      sourceLabel: t("nav.development"),
      sourceHref: "/development",
    };
  }

  /* ---- Coverage gaps ------------------------------------------------- */
  if (has(q, "gap", "coverage", "open slot", "unassigned", "pourvoir", "couverture", "postes", "vide", "week-end", "weekend", "puestos", "cobertura", "vacio", "luecken", "besetzen", "offene")) {
    const week = fixtures.filter(
      (f) => !f.played && inScope(f.countryCode) && f.date >= weekStarts()[1] && f.date <= weekStarts()[2],
    );
    const gaps = week.filter((f) => openSlots(f) > 0).sort((a, b) => openSlots(b) - openSlots(a));
    const total = gaps.reduce((s, f) => s + openSlots(f), 0);

    return {
      headline: t("copilot.a.gapHead", { total, n: gaps.length }),
      detail: t("copilot.a.gapDetail", { done: week.filter(crewIsComplete).length, total: week.length }),
      rows: gaps.slice(0, 8).map((f) => ({
        label: `${f.home} — ${f.away}`,
        flag: f.countryCode,
        meta: t("copilot.a.gapRow", { slots: openSlots(f), date: f.date, days: daysBetween(today(), f.date) }),
        href: "/calendar",
      })),
      sourceLabel: t("nav.calendar"),
      sourceHref: "/calendar",
    };
  }

  /* ---- Fitness ------------------------------------------------------- */
  if (has(q, "fitness", "physique", "test", "sprint", "echoue", "failed", "fail", "fisic", "fitnesstest", "durchgefallen", "kondition")) {
    const failed = fitnessTests.filter((f) => {
      const referee = refereeById.get(f.refereeId);
      if (!referee || !codes.includes(referee.countryCode)) return false;
      return f.test1.result === "failed" || f.test2.result === "failed";
    });

    return {
      headline: t("copilot.a.fitHead", { n: failed.length }),
      detail: t("copilot.a.fitDetail"),
      rows: failed.flatMap((f) => {
        const referee = refereeById.get(f.refereeId);
        if (!referee) return [];
        const parts = [f.test1.result === "failed" ? "Test 1" : null, f.test2.result === "failed" ? "Test 2" : null].filter(Boolean);
        return [
          {
            label: referee.name,
            flag: referee.countryCode,
            meta: t("copilot.a.fitRow", { parts: parts.join(" + "), date: f.retestDate ?? "—" }),
            href: refereeHref(referee.id),
          },
        ];
      }),
      sourceLabel: t("nav.development"),
      sourceHref: "/development",
    };
  }

  /* ---- Form ---------------------------------------------------------- */
  if (has(q, "declin", "falling", "dropping", "perte de forme", "en baisse", "worst", "risque", "baja de forma", "bajando", "formschwach", "formverlust", "abwaerts")) {
    const falling = referees
      .filter((r) => codes.includes(r.countryCode) && (r.trend < 0 || r.status === "suspended"))
      .sort((a, b) => a.trend - b.trend);

    return {
      headline: t("copilot.a.formHead", { n: falling.length }),
      rows: falling.map((r) => ({
        label: r.name,
        flag: r.countryCode,
        meta:
          t("copilot.a.formRow", { arps: r.arps.toFixed(1), trend: r.trend.toFixed(1) }) +
          (r.status === "suspended" ? ` · ${t("common.suspended").toLowerCase()}` : ""),
        href: refereeHref(r.id),
      })),
      sourceLabel: t("nav.rankings"),
      sourceHref: "/rankings",
    };
  }

  /* ---- Observer reports ---------------------------------------------- */
  if (has(q, "observer", "observateur", "report", "rapport", "assessment", "overdue", "retard", "observador", "informe", "retraso", "beobachter", "bericht", "ueberfaellig")) {
    const relevant = assessments.filter((a) => {
      const match = matchById.get(a.matchId);
      return match && inScope(match.countryCode);
    });
    const late = relevant.filter((a) => a.state !== "filed");

    return {
      headline: t("copilot.a.obsHead", { late: late.length, n: relevant.length }),
      detail: t("copilot.a.obsDetail"),
      rows: relevant.flatMap((a) => {
        const match = matchById.get(a.matchId);
        const referee = refereeById.get(a.refereeId);
        if (!match || !referee) return [];
        const state =
          a.state === "filed"
            ? t("copilot.a.obsFiled", { mark: a.overall.toFixed(1) })
            : a.state === "draft"
              ? t("copilot.a.obsDraft")
              : t("copilot.a.obsOverdue");
        return [{ label: `${match.home} — ${match.away}`, flag: match.countryCode, meta: `${referee.name} · ${state}`, href: "/assessments" }];
      }),
      sourceLabel: t("nav.assessments"),
      sourceHref: "/assessments",
    };
  }

  /* ---- Calendar feeds ------------------------------------------------ */
  if (has(q, "sync", "synchro", "feed", "flux", "stale", "obsolete", "comet", "sincroniz", "calendario", "synchronis", "kalender")) {
    const scoped = countries.filter((c) => codes.includes(c.code));
    const bad = scoped.filter((c) => c.syncHealth !== "healthy");
    return {
      headline: t("copilot.a.syncHead", { bad: bad.length, n: scoped.length }),
      rows: scoped
        .slice()
        .sort((a, b) => b.lastSyncHours - a.lastSyncHours)
        .slice(0, 8)
        .map((c) => ({
          label: countryName(c.code, locale),
          flag: c.code,
          meta: t("copilot.a.syncRow", { source: c.syncSource, hours: c.lastSyncHours }),
          href: "/federations",
        })),
      sourceLabel: t("common.countries"),
      sourceHref: "/federations",
    };
  }

  /* ---- Availability on a day ----------------------------------------- */
  if (has(q, "available", "disponible", "availability", "disponibilite", "disponibilidad", "verfuegbar", "verfugbar")) {
    const date = /(\d{4}-\d{2}-\d{2})/.exec(q)?.[1] ?? weekStarts()[1] ?? today();
    const free = referees.filter((r) => codes.includes(r.countryCode) && availabilityFor(r.id, date) === "available");
    return {
      headline: t("copilot.a.availHead", { n: free.length, date }),
      rows: free.slice(0, 10).map((r) => ({
        label: r.name,
        flag: r.countryCode,
        meta: `${r.level} · ARPS ${r.arps.toFixed(1)}`,
        href: refereeHref(r.id),
      })),
      sourceLabel: t("nav.calendar"),
      sourceHref: "/calendar",
    };
  }

  /* ---- Workload ------------------------------------------------------ */
  if (has(q, "workload", "busiest", "busy", "charge", "surcharg", "most appointments", "idle", "jamais design", "rotation", "carga", "mas designaciones", "arbeitsbelastung", "meisten ansetzungen", "ausgelastet")) {
    const rows = workloadFor(codes);
    const heavy = rows.filter((r) => r.appointments >= WORKLOAD_HEAVY);
    const idle = rows.filter((r) => r.appointments === 0);
    const wantsIdle = has(q, "idle", "jamais", "not appointed", "sans design", "sin designacion", "nie angesetzt", "ohne ansetzung");
    const shown = wantsIdle ? idle : heavy.length ? heavy : rows.slice(0, 6);

    return {
      headline: wantsIdle
        ? t("copilot.a.loadIdleHead", { n: idle.length })
        : t("copilot.a.loadHeavyHead", { n: heavy.length, max: WORKLOAD_HEAVY, name: rows[0]?.name ?? "—" }),
      detail: t("copilot.a.loadDetail"),
      rows: shown.slice(0, 8).map((r) => ({
        label: r.name,
        flag: r.countryCode,
        meta: t("copilot.a.loadRow", {
          n: r.appointments,
          asRef: r.asReferee,
          next: r.nextInDays === null ? t("overview.noNext") : t("overview.nextIn", { n: r.nextInDays }),
        }),
        href: "/calendar",
      })),
      sourceLabel: t("nav.overview"),
      sourceHref: "/",
    };
  }

  /* ---- Zone summary --------------------------------------------------- */
  if (has(q, "zone", "unaf", "cosafa", "cecafa", "uniffac", "ufoa", "wafu", "zona")) {
    const named = zones.find((z) => q.includes(strip(z)) || q.includes(strip(translate(locale, zoneKey[z]))));
    const summary = zones.map((zone) => {
      const zoneCountries = countries.filter((c) => c.zone === zone && codes.includes(c.code));
      const corps = referees.filter((r) => zoneCountries.some((c) => c.code === r.countryCode));
      return {
        zone,
        countries: zoneCountries.length,
        corps: corps.length,
        avg: corps.length ? corps.reduce((s, r) => s + r.arps, 0) / corps.length : 0,
        best: corps.slice().sort((a, b) => b.arps - a.arps)[0],
      };
    });
    const shown = named ? summary.filter((z) => z.zone === named) : summary.filter((z) => z.corps > 0);

    return {
      headline: named
        ? t("copilot.a.zoneHeadNamed", { zone: named, name: t(zoneKey[named]), n: shown[0]?.corps ?? 0, c: shown[0]?.countries ?? 0 })
        : t("copilot.a.zoneHeadAll", { n: shown.length }),
      rows: shown.map((z) => ({
        label: `${z.zone} — ${t(zoneKey[z.zone])}`,
        meta: t("copilot.a.zoneRow", { n: z.corps, arps: z.avg.toFixed(1), name: z.best?.name ?? "—" }),
        href: "/rankings",
      })),
      sourceLabel: t("common.countries"),
      sourceHref: "/federations",
    };
  }

  /* ---- Top referees, optionally by country --------------------------- */
  if (has(q, "top", "best", "meilleur", "meilleurs", "ranking", "classement", "elite", "mejores", "clasificacion", "beste", "rangliste")) {
    const country = countries.find((c) =>
      [c.name, c.nameFr, c.nameEs, c.nameDe, c.federation].some((name) => name && q.includes(strip(name))),
    );
    const pool = referees
      .filter((r) => (country ? r.countryCode === country.code : codes.includes(r.countryCode)))
      .sort((a, b) => b.arps - a.arps);

    if (pool.length === 0) return null;

    return {
      headline: country
        ? t("copilot.a.topHeadCountry", { n: pool.length, country: countryName(country.code, locale), name: pool[0].name })
        : t("copilot.a.topHeadAll", { name: pool[0].name, arps: pool[0].arps.toFixed(1) }),
      rows: pool.slice(0, 8).map((r, i) => ({
        label: `${i + 1}. ${r.name}`,
        flag: r.countryCode,
        meta: t("copilot.a.topRow", { arps: r.arps.toFixed(1), level: r.level, n: r.matches }),
        href: refereeHref(r.id),
      })),
      sourceLabel: t("nav.rankings"),
      sourceHref: "/rankings",
    };
  }

  /* ---- A named referee ----------------------------------------------- */
  const named = referees.find((r) => {
    const parts = strip(r.name).split(/\s+/);
    return parts.some((part) => part.length > 3 && q.includes(part));
  });
  if (named) {
    const fitness = fitnessTests.find((f) => f.refereeId === named.id);
    const next = fixtures.find((f) => !f.played && f.crew.some((s) => s.officialId === named.id));
    const bestFor = next ? bestCandidate(next, "R", next.crew) : null;
    const result = (r: "passed" | "failed") => t(r === "passed" ? "development.passed" : "development.failed").toLowerCase();
    return {
      headline: t("copilot.a.refHead", { name: named.name, arps: named.arps.toFixed(1), level: named.level, n: named.matches }),
      detail: pickLocalized(named.bio, locale),
      rows: [
        {
          label: t("copilot.a.refNext"),
          meta: next ? `${next.home} — ${next.away} · ${next.date}` : t("copilot.a.refNone"),
          href: "/calendar",
        },
        ...(fitness
          ? [{ label: t("copilot.a.refFitness"), meta: `${result(fitness.test1.result)} / ${result(fitness.test2.result)} · ${fitness.date}`, href: "/development" }]
          : []),
        {
          label: t("copilot.a.refTrend"),
          meta: `${named.trend >= 0 ? "+" : ""}${named.trend.toFixed(1)} · ${t("referees.varAccuracy")} ${named.varAccuracy}%`,
          href: refereeHref(named.id),
        },
        ...(bestFor && bestFor.id !== named.id
          ? [{ label: t("copilot.a.refAlt"), meta: bestFor.name, href: refereeHref(bestFor.id) }]
          : []),
      ],
      sourceLabel: t("nav.referees"),
      sourceHref: refereeHref(named.id),
    };
  }

  return null;
}
