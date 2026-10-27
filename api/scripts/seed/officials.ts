// The referee register: officials with their portraits, licences, fitness tests, courses, availability,
// and the disciplinary case behind the one suspension the demo dataset contains.

import {
  assistants,
  availabilityFor,
  countries,
  courses,
  DEMO_TODAY,
  fitnessTests,
  licences,
  referees,
  weekDates,
} from "../../seed/demo-data";
import { addDays, type SeedContext } from "./context";
import { jsonCell, type Cell } from "./sql";

const hash = (s: string) => [...s].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261);

const birth = (anchor: string, id: string, age: number) => {
  const h = hash(id);
  const month = 1 + (h % 12);
  const day = 1 + ((h >> 4) % 28);
  return `${Number(anchor.slice(0, 4)) - age}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

export function writeOfficials(ctx: SeedContext) {
  const { sql, media, sh, anchor } = ctx;
  const out = sql.section("officials");

  const counters = new Map<string, number>();
  const next = (k: string) => (counters.set(k, (counters.get(k) ?? 0) + 1), counters.get(k)!);
  const matricule = (code: string, kind: "referee" | "assistant", n: number) => `ARIS-${code}-${kind === "referee" ? "R" : "A"}${String(n).padStart(4, "0")}`;
  const countryName = new Map(countries.map((c) => [c.code, c.name]));
  const league = new Map(countries.map((c) => [c.code, c.fact.league.name]));

  const cols = ["id", "kind", "matricule", "name", "initials", "country_code", "nationality", "birth_date", "city", "league", "intervention_zones", "photo_media_id", "level", "status", "var_qualified", "years_active",
    "arps", "rmcs_avg", "fitness", "matches", "yellow_cards", "red_cards", "var_accuracy", "trend", "bio"];

  const rows: Cell[][] = [
    ...referees.map((r) => [
      r.id, "referee", matricule(r.countryCode, "referee", next(`${r.countryCode}R`)), r.name, r.initials, r.countryCode, countryName.get(r.countryCode) ?? null,
      birth(anchor, r.id, r.age), r.city, league.get(r.countryCode) ?? null, jsonCell([r.countryCode]), media.portrait(r.id, r.initials).id, r.level, r.status, r.varQualified, r.yearsActive,
      r.arps, r.rmcsAvg, r.fitness, r.matches, r.cards.yellow, r.cards.red, r.varAccuracy, r.trend, jsonCell(r.bio),
    ]),
    ...assistants.map((a) => [
      a.id, "assistant", matricule(a.countryCode, "assistant", next(`${a.countryCode}A`)), a.name, a.initials, a.countryCode, countryName.get(a.countryCode) ?? null,
      birth(anchor, a.id, a.age), a.city, league.get(a.countryCode) ?? null, jsonCell([a.countryCode]), media.portrait(a.id, a.initials).id, a.level, "active", false, a.yearsActive,
      0, a.rating, a.fitness, 0, 0, 0, 0, 0, jsonCell({}),
    ]),
  ];
  out.comment("officials (referees and assistants) — portraits are generated monograms, not photographs");
  out.insert("officials", cols, rows);

  out.comment("licences, fitness, courses");
  out.insert("licences", ["id", "official_id", "kind", "issued", "expires"], licences.map((l) => [l.id, l.refereeId, l.kind, sh(l.issued), sh(l.expires)]));
  out.insert(
    "fitness_tests",
    ["official_id", "date", "test1_result", "best_sprint", "test2_result", "laps", "retest_date"],
    fitnessTests.map((f) => [f.refereeId, sh(f.date), f.test1.result, f.test1.bestSprint, f.test2.result, f.test2.laps, f.retestDate ? sh(f.retestDate) : null]),
  );
  out.insert(
    "courses",
    ["id", "kind", "name", "provider", "hours", "state"],
    courses.map((c) => [c.id, "course", jsonCell(c.name), c.provider, c.hours, c.state]),
  );
  out.insert("course_enrolments", ["course_id", "official_id"], courses.flatMap((c) => c.refereeIds.map((id) => [c.id, id])));

  // everything that is not simply "available"
  const window = [-7, 0, 7, 14].flatMap((d) => weekDates(addDays(DEMO_TODAY, d)));
  const everyone = [...referees.map((r) => r.id), ...assistants.map((a) => a.id)];
  const availabilityRows: Cell[][] = [];
  for (const id of everyone) {
    for (const date of new Set(window)) {
      const state = availabilityFor(id, date);
      if (state === "unavailable" || state === "travelling" || state === "resting") {
        availabilityRows.push([id, sh(date), state, state === "unavailable" ? "other" : null]);
      }
    }
  }
  out.insert("availability", ["official_id", "date", "state", "reason"], availabilityRows);
}

/** The demo's one suspended referee must have the decision that suspended him — a report alone never suspends. */
export function writeSuspensionCase(ctx: SeedContext) {
  const out = ctx.sql.section("discipline");
  for (const r of referees.filter((x) => x.status === "suspended")) {
    out.raw(`UPDATE officials SET status_before_suspension = 'active' WHERE id = '${r.id}'`);
    const opened = ctx.sh(addDays(DEMO_TODAY, -12));
    out.insert("incidents", ["id", "kind", "official_id", "severity", "status", "description", "reported_at"], [
      [`inc-${r.id}`, "incident", r.id, "major", "reviewing", "Conduct complaint lodged by a club after the fixture; the file was referred to the disciplinary body.", `${opened}T09:00:00.000Z`],
    ]);
    out.insert("disciplinary_cases", ["id", "official_id", "incident_id", "status", "summary", "decision", "decision_ref", "sanction", "suspension_from", "suspension_to", "opened_at", "decided_at"], [
      [
        `case-${r.id}`, r.id, `inc-${r.id}`, "decided",
        "Removed from the appointment list pending the disciplinary body's review.",
        "Suspended from appointments pending review.", `DEMO-DISC-${r.countryCode}-001`, "suspension",
        ctx.sh(addDays(DEMO_TODAY, -10)), ctx.sh(addDays(DEMO_TODAY, 40)),
        `${opened}T09:00:00.000Z`, `${ctx.sh(addDays(DEMO_TODAY, -10))}T12:00:00.000Z`,
      ],
    ]);
  }
}
