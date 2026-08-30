// ARIS Copilot.
//
// It answers from the same in-memory data every other screen reads, and returns
// the rows it used so the answer can be checked. It never produces a number
// that is not already on a row somewhere in the product — when a question falls
// outside that, it says so instead of guessing.

import { bestCandidate, candidatesForSlot } from "./assignment";
import type { Locale } from "./i18n/dictionary";
import {
  DEMO_TODAY,
  assessments,
  availabilityFor,
  competitionById,
  countries,
  countryFlag,
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
  weekStarts,
  workloadFor,
  WORKLOAD_HEAVY,
  zoneNames,
  zoneNamesFr,
  zones,
} from "./mock-data";

export interface AnswerRow {
  label: string;
  meta: string;
  href?: string;
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

export function suggestions(locale: Locale) {
  return locale === "fr"
    ? [
        "Qui devrait arbitrer la finale de la Ligue des champions ?",
        "Quelles licences expirent dans les 90 jours ?",
        "Où sont les postes à pourvoir ce week-end ?",
        "Meilleurs arbitres au Maroc",
        "Qui est en perte de forme ?",
        "Quels arbitres ont échoué au test physique ?",
        "Qui porte le plus de désignations ?",
        "Résumé de la zone UNAF",
      ]
    : [
        "Who should referee the Champions League final?",
        "Which licences expire in the next 90 days?",
        "Where are the coverage gaps this weekend?",
        "Top referees in Morocco",
        "Who is declining in form?",
        "Which referees failed a fitness test?",
        "Who is carrying the most appointments?",
        "Summarise the UNAF zone",
      ];
}

export function ask(question: string, locale: Locale, codes: string[]): Answer | null {
  const q = strip(question);
  const fr = locale === "fr";
  const inScope = (code: string) => code === "CAF" || codes.includes(code);

  /* ---- Who should referee <fixture> ---------------------------------- */
  if (has(q, "who should", "qui devrait", "recommend", "recommande", "designer", "designate", "appoint", "arbitrer")) {
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
      headline: fr
        ? `${pick.name} pour ${fixture.home} — ${fixture.away}.`
        : `${pick.name} for ${fixture.home} — ${fixture.away}.`,
      detail: fr
        ? `Meilleure compatibilité du groupe éligible (${pick.rating.toFixed(0)}), ${pick.rest} jours de repos, ${pick.travelHours} h de trajet, risque de friction ${
            pick.frictionRisk === "low" ? "faible" : pick.frictionRisk === "medium" ? "moyen" : "élevé"
          }. ${ranked.length} officiels passaient le contrôle de neutralité.`
        : `Highest compatibility in the eligible pool (${pick.rating.toFixed(0)}), ${pick.rest} rest days, ${pick.travelHours} h travel, ${pick.frictionRisk} friction risk. ${ranked.length} officials cleared the neutrality check.`,
      rows: ranked.slice(0, 5).map((c, i) => ({
        label: `${i + 1}. ${countryFlag(c.countryCode)} ${c.name}`,
        meta: fr
          ? `score ${c.score.toFixed(0)} · repos ${c.rest} j · trajet ${c.travelHours} h`
          : `score ${c.score.toFixed(0)} · rest ${c.rest} d · travel ${c.travelHours} h`,
        href: `/referees/${c.id}`,
      })),
      sourceLabel: fr ? "Désignation IA" : "AI assignment",
      sourceHref: "/arae",
    };
  }

  /* ---- Licences ------------------------------------------------------ */
  if (has(q, "licence", "license", "expire", "expiring", "renew", "renouvel", "certification")) {
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
      headline: fr
        ? `${due.length} licences arrivent à échéance sous ${horizon} jours (ou sont déjà expirées).`
        : `${due.length} licences fall due inside ${horizon} days, or have already expired.`,
      detail: fr
        ? "Une licence expirée retire l'officiel de la liste de désignation tant qu'elle n'est pas renouvelée."
        : "An expired licence takes the official off the appointment list until it is renewed.",
      rows: due.slice(0, 8).map((l) => {
        const referee = refereeById.get(l.refereeId)!;
        const status = licenceStatus(l);
        return {
          label: `${countryFlag(referee.countryCode)} ${referee.name} — ${l.kind}`,
          meta:
            status.state === "expired"
              ? fr
                ? `expirée depuis ${Math.abs(status.days)} j`
                : `expired ${Math.abs(status.days)} d ago`
              : fr
                ? `expire dans ${status.days} j`
                : `expires in ${status.days} d`,
          href: `/referees/${referee.id}`,
        };
      }),
      sourceLabel: fr ? "Développement" : "Development",
      sourceHref: "/development",
    };
  }

  /* ---- Coverage gaps ------------------------------------------------- */
  if (has(q, "gap", "coverage", "open slot", "unassigned", "pourvoir", "couverture", "postes", "vide", "week-end", "weekend")) {
    const week = fixtures.filter(
      (f) => !f.played && inScope(f.countryCode) && f.date >= weekStarts[1] && f.date <= weekStarts[2],
    );
    const gaps = week.filter((f) => openSlots(f) > 0).sort((a, b) => openSlots(b) - openSlots(a));
    const total = gaps.reduce((s, f) => s + openSlots(f), 0);

    return {
      headline: fr
        ? `${total} postes vides sur ${gaps.length} rencontres cette semaine.`
        : `${total} empty slots across ${gaps.length} fixtures this week.`,
      detail: fr
        ? `${week.filter(crewIsComplete).length} des ${week.length} rencontres de la semaine ont déjà un trio complet.`
        : `${week.filter(crewIsComplete).length} of this week's ${week.length} fixtures already have a full crew.`,
      rows: gaps.slice(0, 8).map((f) => ({
        label: `${countryFlag(f.countryCode)} ${f.home} — ${f.away}`,
        meta: fr
          ? `${openSlots(f)} postes · ${f.date} · dans ${daysBetween(DEMO_TODAY, f.date)} j`
          : `${openSlots(f)} slots · ${f.date} · in ${daysBetween(DEMO_TODAY, f.date)} d`,
        href: "/calendar",
      })),
      sourceLabel: fr ? "Calendrier" : "Calendar",
      sourceHref: "/calendar",
    };
  }

  /* ---- Fitness ------------------------------------------------------- */
  if (has(q, "fitness", "physique", "test", "sprint", "echoue", "failed", "fail")) {
    const failed = fitnessTests.filter((f) => {
      const referee = refereeById.get(f.refereeId);
      if (!referee || !codes.includes(referee.countryCode)) return false;
      return f.test1.result === "failed" || f.test2.result === "failed";
    });

    return {
      headline: fr
        ? `${failed.length} officiels ont échoué à au moins une épreuve du test physique.`
        : `${failed.length} officials failed at least one part of the fitness test.`,
      detail: fr
        ? "Le protocole FIFA comporte deux épreuves : sprints répétés et test par intervalles. Un échec impose un contre-test."
        : "The FIFA protocol has two parts: repeated sprints and the interval test. A failure means a retest is required.",
      rows: failed.map((f) => {
        const referee = refereeById.get(f.refereeId)!;
        const parts = [
          f.test1.result === "failed" ? (fr ? "Test 1" : "Test 1") : null,
          f.test2.result === "failed" ? (fr ? "Test 2" : "Test 2") : null,
        ].filter(Boolean);
        return {
          label: `${countryFlag(referee.countryCode)} ${referee.name}`,
          meta: fr
            ? `${parts.join(" + ")} échoué · contre-test ${f.retestDate ?? "—"}`
            : `${parts.join(" + ")} failed · retest ${f.retestDate ?? "—"}`,
          href: `/referees/${referee.id}`,
        };
      }),
      sourceLabel: fr ? "Développement" : "Development",
      sourceHref: "/development",
    };
  }

  /* ---- Form ---------------------------------------------------------- */
  if (has(q, "declin", "falling", "dropping", "perte de forme", "en baisse", "worst", "risque")) {
    const falling = referees
      .filter((r) => codes.includes(r.countryCode) && (r.trend < 0 || r.status === "suspended"))
      .sort((a, b) => a.trend - b.trend);

    return {
      headline: fr
        ? `${falling.length} officiels sont en baisse dans ce périmètre.`
        : `${falling.length} officials are trending down in this scope.`,
      rows: falling.map((r) => ({
        label: `${countryFlag(r.countryCode)} ${r.name}`,
        meta: fr
          ? `ARPS ${r.arps.toFixed(1)} · tendance ${r.trend.toFixed(1)}${r.status === "suspended" ? " · suspendu" : ""}`
          : `ARPS ${r.arps.toFixed(1)} · trend ${r.trend.toFixed(1)}${r.status === "suspended" ? " · suspended" : ""}`,
        href: `/referees/${r.id}`,
      })),
      sourceLabel: fr ? "Classement" : "Rankings",
      sourceHref: "/rankings",
    };
  }

  /* ---- Observer reports ---------------------------------------------- */
  if (has(q, "observer", "observateur", "report", "rapport", "assessment", "overdue", "retard")) {
    const relevant = assessments.filter((a) => {
      const match = matchById.get(a.matchId);
      return match && inScope(match.countryCode);
    });
    const late = relevant.filter((a) => a.state !== "filed");

    return {
      headline: fr
        ? `${late.length} rapports d'observateur ne sont pas déposés, sur ${relevant.length} rencontres analysées.`
        : `${late.length} observer reports are not filed, out of ${relevant.length} reviewed matches.`,
      detail: fr
        ? "L'observateur dispose de 48 heures après le coup d'envoi."
        : "The observer has 48 hours after kick-off.",
      rows: relevant.map((a) => {
        const match = matchById.get(a.matchId)!;
        const referee = refereeById.get(a.refereeId)!;
        return {
          label: `${match.home} — ${match.away}`,
          meta: fr
            ? `${referee.name} · ${a.state === "filed" ? `déposé, note ${a.overall.toFixed(1)}` : a.state === "draft" ? "brouillon" : "en retard"}`
            : `${referee.name} · ${a.state === "filed" ? `filed, mark ${a.overall.toFixed(1)}` : a.state}`,
          href: "/assessments",
        };
      }),
      sourceLabel: fr ? "Rapports d'observateur" : "Observer reports",
      sourceHref: "/assessments",
    };
  }

  /* ---- Calendar feeds ------------------------------------------------ */
  if (has(q, "sync", "synchro", "feed", "flux", "stale", "obsolete", "comet")) {
    const scoped = countries.filter((c) => codes.includes(c.code));
    const bad = scoped.filter((c) => c.syncHealth !== "healthy");
    return {
      headline: fr
        ? `${bad.length} calendriers sur ${scoped.length} ne sont pas à jour.`
        : `${bad.length} of ${scoped.length} calendar feeds are not current.`,
      rows: scoped
        .slice()
        .sort((a, b) => b.lastSyncHours - a.lastSyncHours)
        .slice(0, 8)
        .map((c) => ({
          label: `${c.flag} ${countryName(c.code, locale)}`,
          meta: fr
            ? `${c.syncSource} · dernière synchro il y a ${c.lastSyncHours} h`
            : `${c.syncSource} · last sync ${c.lastSyncHours} h ago`,
          href: "/federations",
        })),
      sourceLabel: fr ? "Pays" : "Countries",
      sourceHref: "/federations",
    };
  }

  /* ---- Availability on a day ----------------------------------------- */
  if (has(q, "available", "disponible", "availability", "disponibilite")) {
    const date = /(\d{4}-\d{2}-\d{2})/.exec(q)?.[1] ?? weekStarts[1];
    const free = referees.filter(
      (r) => codes.includes(r.countryCode) && availabilityFor(r.id, date) === "available",
    );
    return {
      headline: fr
        ? `${free.length} arbitres sont disponibles le ${date}.`
        : `${free.length} referees are available on ${date}.`,
      rows: free.slice(0, 10).map((r) => ({
        label: `${countryFlag(r.countryCode)} ${r.name}`,
        meta: `${r.level} · ARPS ${r.arps.toFixed(1)}`,
        href: `/referees/${r.id}`,
      })),
      sourceLabel: fr ? "Calendrier" : "Calendar",
      sourceHref: "/calendar",
    };
  }

  /* ---- Workload ------------------------------------------------------ */
  if (has(q, "workload", "busiest", "busy", "charge", "surcharg", "most appointments", "idle", "jamais design", "rotation")) {
    const rows = workloadFor(codes);
    const heavy = rows.filter((r) => r.appointments >= WORKLOAD_HEAVY);
    const idle = rows.filter((r) => r.appointments === 0);
    const wantsIdle = has(q, "idle", "jamais", "not appointed", "sans design");
    const shown = wantsIdle ? idle : heavy.length ? heavy : rows.slice(0, 6);

    return {
      headline: wantsIdle
        ? fr
          ? `${idle.length} officiels n'ont aucune désignation sur la fenêtre de trois semaines.`
          : `${idle.length} officials have no appointment across the three-week window.`
        : fr
          ? `${heavy.length} officiels portent ${WORKLOAD_HEAVY} désignations ou plus ; ${rows[0]?.name ?? "—"} en a le plus.`
          : `${heavy.length} officials are carrying ${WORKLOAD_HEAVY} or more appointments; ${rows[0]?.name ?? "—"} has the most.`,
      detail: fr
        ? "Une charge déséquilibrée use les uns et fait perdre les autres — les deux se corrigent au moment de la désignation."
        : "Uneven load burns some officials out and quietly loses the others — both are fixed at appointment time.",
      rows: shown.slice(0, 8).map((r) => ({
        label: `${countryFlag(r.countryCode)} ${r.name}`,
        meta: fr
          ? `${r.appointments} désignations · ${r.asReferee} au centre · ${r.nextInDays === null ? "rien de prévu" : `prochaine dans ${r.nextInDays} j`}`
          : `${r.appointments} appointments · ${r.asReferee} as referee · ${r.nextInDays === null ? "nothing booked" : `next in ${r.nextInDays} d`}`,
        href: "/calendar",
      })),
      sourceLabel: fr ? "Vue d'ensemble" : "Overview",
      sourceHref: "/",
    };
  }

  /* ---- Zone summary --------------------------------------------------- */
  if (has(q, "zone", "unaf", "cosafa", "cecafa", "uniffac", "ufoa", "wafu")) {
    const labels = fr ? zoneNamesFr : zoneNames;
    const named = zones.find((z) => q.includes(strip(z)) || q.includes(strip(labels[z])));
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
        ? fr
          ? `${named} (${labels[named]}) : ${shown[0]?.corps ?? 0} arbitres sur ${shown[0]?.countries ?? 0} fédérations.`
          : `${named} (${labels[named]}): ${shown[0]?.corps ?? 0} referees across ${shown[0]?.countries ?? 0} federations.`
        : fr
          ? `${shown.length} zones CAF ont des arbitres dans ce périmètre.`
          : `${shown.length} CAF zones have referees in this scope.`,
      rows: shown.map((z) => ({
        label: `${z.zone} — ${labels[z.zone]}`,
        meta: fr
          ? `${z.corps} arbitres · ARPS ${z.avg.toFixed(1)} · en tête ${z.best?.name ?? "—"}`
          : `${z.corps} referees · ARPS ${z.avg.toFixed(1)} · led by ${z.best?.name ?? "—"}`,
        href: "/rankings",
      })),
      sourceLabel: fr ? "Pays" : "Countries",
      sourceHref: "/federations",
    };
  }

  /* ---- Top referees, optionally by country --------------------------- */
  if (has(q, "top", "best", "meilleur", "meilleurs", "ranking", "classement", "elite")) {
    const country = countries.find(
      (c) => q.includes(strip(c.name)) || q.includes(strip(c.nameFr)) || q.includes(strip(c.federation)),
    );
    const pool = referees
      .filter((r) => (country ? r.countryCode === country.code : codes.includes(r.countryCode)))
      .sort((a, b) => b.arps - a.arps);

    if (pool.length === 0) return null;

    return {
      headline: country
        ? fr
          ? `${pool.length} arbitres suivis au ${countryName(country.code, locale)} — ${pool[0].name} en tête.`
          : `${pool.length} referees tracked in ${countryName(country.code, locale)} — ${pool[0].name} leads.`
        : fr
          ? `${pool[0].name} est en tête du périmètre avec un ARPS de ${pool[0].arps.toFixed(1)}.`
          : `${pool[0].name} leads this scope with an ARPS of ${pool[0].arps.toFixed(1)}.`,
      rows: pool.slice(0, 8).map((r, i) => ({
        label: `${i + 1}. ${countryFlag(r.countryCode)} ${r.name}`,
        meta: `ARPS ${r.arps.toFixed(1)} · ${r.level} · ${r.matches} ${fr ? "rencontres" : "matches"}`,
        href: `/referees/${r.id}`,
      })),
      sourceLabel: fr ? "Classement" : "Rankings",
      sourceHref: "/rankings",
    };
  }

  /* ---- A named referee ----------------------------------------------- */
  const named = referees.find((r) => {
    const parts = strip(r.name).split(/\s+/);
    return parts.some((part) => part.length > 3 && q.includes(part));
  });
  if (named) {
    const fitness = fitnessTests.find((f) => f.refereeId === named.id)!;
    const next = fixtures.find(
      (f) => !f.played && f.crew.some((s) => s.officialId === named.id),
    );
    const bestFor = next ? bestCandidate(next, "R", next.crew) : null;
    return {
      headline: fr
        ? `${named.name} — ARPS ${named.arps.toFixed(1)}, ${named.level}, ${named.matches} rencontres.`
        : `${named.name} — ARPS ${named.arps.toFixed(1)}, ${named.level}, ${named.matches} matches.`,
      detail: named.bio[locale],
      rows: [
        {
          label: fr ? "Prochaine désignation" : "Next appointment",
          meta: next ? `${next.home} — ${next.away} · ${next.date}` : fr ? "aucune" : "none",
          href: "/calendar",
        },
        {
          label: fr ? "Test physique" : "Fitness test",
          meta: `${fitness.test1.result} / ${fitness.test2.result} · ${fitness.date}`,
          href: "/development",
        },
        {
          label: fr ? "Tendance" : "Trend",
          meta: `${named.trend >= 0 ? "+" : ""}${named.trend.toFixed(1)} · ${fr ? "précision VAR" : "VAR accuracy"} ${named.varAccuracy}%`,
          href: `/referees/${named.id}`,
        },
        ...(bestFor && bestFor.id !== named.id
          ? [
              {
                label: fr ? "Alternative recommandée" : "Recommended alternative",
                meta: bestFor.name,
                href: `/referees/${bestFor.id}`,
              },
            ]
          : []),
      ],
      sourceLabel: fr ? "Fiche arbitre" : "Referee profile",
      sourceHref: `/referees/${named.id}`,
    };
  }

  return null;
}
