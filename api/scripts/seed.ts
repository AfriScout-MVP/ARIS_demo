// Turns ARIS's demo dataset (site/src/lib/mock-data.ts) into SQL for D1.
//
//   npm run db:seed          # local database
//   npm run db:seed:remote   # the real one — DEMO DATA, do not run against production records
//
// Every date is shifted so the demo week starts at --anchor (default: this week's
// Monday), which keeps the live calendar populated whenever it is seeded.
// No accounts and no passwords are created here — use `npm run user:create`.

import {
  assessments,
  assistants,
  availabilityFor,
  competitions,
  countries,
  courses,
  dossiers,
  DEMO_TODAY,
  fitnessTests,
  fixtureNations,
  fixtures,
  licences,
  matches,
  notifications,
  referees,
  weekDates,
} from "../../site/src/lib/mock-data";

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

function mondayOf(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(iso, -dow);
}

const anchor = flag("anchor") ?? mondayOf(new Date().toISOString().slice(0, 10));
if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) throw new Error("--anchor must be YYYY-MM-DD");
const shiftBy = daysBetween(DEMO_TODAY, anchor);
const sh = (iso: string) => addDays(iso, shiftBy);
const shNullable = (iso: string | null) => (iso ? sh(iso) : null);

type Cell = string | number | null | boolean;
const q = (v: Cell) => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  return `'${v.replace(/'/g, "''")}'`;
};
const j = (v: unknown) => q(JSON.stringify(v));

const out: string[] = [];
const insert = (table: string, cols: string[], rows: Cell[][]) => {
  // D1 limits a statement's size, so rows are written one INSERT each.
  for (const row of rows) out.push(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${row.map(q).join(", ")});`);
};

out.push(`-- ARIS demo seed — generated ${new Date().toISOString()} — demo week starts ${anchor}`);
out.push("-- DEMO DATA ONLY. Every name, score and figure below is illustrative.");

/* ---- geography & competitions ---- */
insert("countries", ["code", "name", "name_fr", "flag", "federation", "zone", "capital", "sync_source", "sync_health", "last_sync_hours", "clubs"],
  countries.map((c) => [c.code, c.name, c.nameFr, c.flag, c.federation, c.zone, c.capital, c.syncSource, c.syncHealth, c.lastSyncHours, JSON.stringify(c.clubs)]));
insert("competitions", ["id", "country_code", "name", "tier", "gender", "matchdays", "current_matchday", "var_enabled", "weight"],
  competitions.map((c) => [c.id, c.countryCode, c.name, c.tier, c.gender, c.matchdays, c.currentMatchday, c.varEnabled, c.weight]));

/* ---- officials ---- */
const hash = (s: string) => [...s].reduce((h, ch) => (Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0), 2166136261);
const birth = (id: string, age: number) => {
  const h = hash(id);
  const month = 1 + (h % 12);
  const day = 1 + ((h >> 4) % 28);
  return `${Number(anchor.slice(0, 4)) - age}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};
const matricule = (code: string, kind: string, n: number) => `ARIS-${code}-${kind === "referee" ? "R" : "A"}${String(n).padStart(4, "0")}`;

const OFFICIAL_COLS = ["id", "kind", "matricule", "name", "initials", "country_code", "nationality", "birth_date", "city", "level", "status", "var_qualified", "years_active",
  "arps", "rmcs_avg", "fitness", "matches", "yellow_cards", "red_cards", "var_accuracy", "trend", "bio_en", "bio_fr"];
const counters = new Map<string, number>();
const next = (k: string) => (counters.set(k, (counters.get(k) ?? 0) + 1), counters.get(k)!);
const countryName = new Map(countries.map((c) => [c.code, c.name]));
const capital = new Map(countries.map((c) => [c.code, c.capital]));

insert("officials", OFFICIAL_COLS, [
  ...referees.map((r) => [r.id, "referee", matricule(r.countryCode, "referee", next(r.countryCode + "R")), r.name, r.initials, r.countryCode, countryName.get(r.countryCode) ?? null,
    birth(r.id, r.age), r.city, r.level, r.status, r.varQualified, r.yearsActive, r.arps, r.rmcsAvg, r.fitness, r.matches, r.cards.yellow, r.cards.red, r.varAccuracy, r.trend, r.bio.en, r.bio.fr]),
  ...assistants.map((a) => [a.id, "assistant", matricule(a.countryCode, "assistant", next(a.countryCode + "A")), a.name, a.initials, a.countryCode, countryName.get(a.countryCode) ?? null,
    null, capital.get(a.countryCode) ?? null, a.level, "active", false, 0, 0, a.rating, 80, 0, 0, 0, 0, 0, "", ""]),
]);

/* ---- training ---- */
insert("licences", ["id", "official_id", "kind", "issued", "expires"], licences.map((l) => [l.id, l.refereeId, l.kind, sh(l.issued), sh(l.expires)]));
insert("fitness_tests", ["official_id", "date", "test1_result", "best_sprint", "test2_result", "laps", "retest_date"],
  fitnessTests.map((f) => [f.refereeId, sh(f.date), f.test1.result, f.test1.bestSprint, f.test2.result, f.test2.laps, shNullable(f.retestDate)]));
insert("courses", ["id", "kind", "name", "provider", "hours", "state"], courses.map((c) => [c.id, "course", JSON.stringify(c.name), c.provider, c.hours, c.state]));
insert("course_enrolments", ["course_id", "official_id"], courses.flatMap((c) => c.refereeIds.map((id) => [c.id, id])));

/* ---- fixtures & designations ---- */
const requiredFilled = (f: (typeof fixtures)[number]) => f.crew.filter((s) => s.role !== "OBS");
insert("fixtures", ["id", "country_code", "competition_id", "matchday", "date", "kickoff", "home", "away", "home_code", "away_code", "city", "venue", "importance", "risk", "played", "designation_status"],
  fixtures.map((f) => {
    const req = requiredFilled(f);
    const status = f.played
      ? "published"
      : req.every((s) => s.state === "confirmed")
        ? "validated"
        : req.every((s) => s.officialId && s.state !== "declined")
          ? "awaiting_confirmation"
          : "draft";
    const nations = f.countryCode === "CAF" ? fixtureNations.get(f.id) : undefined;
    return [f.id, f.countryCode, f.competitionId, f.matchday, sh(f.date), f.kickoff, f.home, f.away, nations?.[0] ?? null, nations?.[1] ?? null, f.city, f.venue, f.importance, f.risk, f.played, status];
  }));
insert("designations", ["fixture_id", "role", "official_id", "state"], fixtures.flatMap((f) => f.crew.map((s) => [f.id, s.role, s.officialId, s.officialId ? s.state : "empty"])));

/* ---- declared availability (everything that is not simply "available") ---- */
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
insert("availability", ["official_id", "date", "state", "reason"], availabilityRows);

/* ---- played matches & observer reports ---- */
const refereeIds = new Set(referees.map((r) => r.id));
insert("matches", ["id", "home", "away", "competition_id", "country_code", "date", "score", "referee_id", "arps_for_match", "rmcs", "pressure_avg", "physical", "pressure_timeline"],
  matches.map((m) => [m.id, m.home, m.away, m.competitionId, m.countryCode, sh(m.date), m.score, m.refereeId, m.arpsForMatch, m.rmcs, m.pressureAvg, JSON.stringify(m.physical), JSON.stringify(m.pressureTimeline)]));
insert("match_decisions", ["id", "match_id", "minute", "type", "description", "initial_call", "var_review", "final_call", "confidence", "pressure_index", "distance", "players"],
  matches.flatMap((m) => m.decisions.map((d) => [`${m.id}:${d.id}`, m.id, d.minute, d.type, JSON.stringify(d.description), d.initialCall, d.varReview, d.finalCall, d.confidence, d.pressureIndex, d.distance, JSON.stringify(d.players)])));
const goodAssessments = assessments.filter((a) => refereeIds.has(a.observerId) && refereeIds.has(a.refereeId));
insert("assessments", ["id", "match_id", "referee_id", "observer_id", "state", "filed_hours_after", "published", "overall", "marks", "notes", "clips"],
  goodAssessments.map((a) => [a.id, a.matchId, a.refereeId, a.observerId, a.state, a.filedHoursAfter, a.state === "filed", a.overall, JSON.stringify(a.marks), JSON.stringify(a.notes), JSON.stringify(a.clips)]));
insert("dossiers", ["id", "match_id", "generated", "pages", "recipients"], dossiers.map((d) => [d.id, d.matchId, sh(d.generated), d.pages, JSON.stringify(d.recipients)]));

/* ---- evaluation grid (weights from the expert brief, mapped onto ARIS's six marks) ---- */
insert("evaluation_criteria", ["key", "label", "weight", "sort"], [
  ["positioning", JSON.stringify({ en: "Positioning and movement", fr: "Positionnement et déplacements" }), 20, 0],
  ["decisions", JSON.stringify({ en: "Interpretation of the Laws of the Game", fr: "Interprétation des lois du jeu" }), 25, 1],
  ["gameManagement", JSON.stringify({ en: "Consistency of decisions", fr: "Cohérence des décisions" }), 20, 2],
  ["discipline", JSON.stringify({ en: "Disciplinary management", fr: "Gestion disciplinaire" }), 15, 3],
  ["teamwork", JSON.stringify({ en: "Communication and authority", fr: "Communication et autorité" }), 10, 4],
  ["fitness", JSON.stringify({ en: "Fitness and match management", fr: "Condition physique et gestion du match" }), 10, 5],
]);

/* ---- fee scales — the brief's example barème, in FCFA. ILLUSTRATIVE: adapt to the competition's regulation. ---- */
const base: Record<string, number> = { R: 20000, AR1: 12000, AR2: 12000, FOURTH: 10000, VAR: 15000, AVAR: 10000, OBS: 15000 };
const tierFactor: Record<string, number> = { d1: 1, d2: 0.7, cup: 1.1, continental: 2.5 };
const feeRows: Cell[][] = [];
for (const [tier, factor] of Object.entries(tierFactor)) {
  for (const [role, amount] of Object.entries(base)) {
    feeRows.push([`fs-${tier}-${role}`, tier, role, Math.round((amount * factor) / 500) * 500, tier === "continental" ? 25000 : 2000, tier === "continental" ? 20000 : 0, 5000, "XOF"]);
  }
}
insert("fee_scales", ["id", "tier", "role", "amount", "transport", "lodging", "meals", "currency"], feeRows);

/* ---- the notifications the demo opens with — to the commission ---- */
insert("notifications", ["id", "audience_role", "dedupe_key", "title", "detail", "tone", "href"],
  notifications.map((n) => [`seed-${n.id}`, "commission", `seed:${n.id}`, JSON.stringify(n.title), JSON.stringify(n.detail), n.tone, n.href]));

process.stdout.write(out.join("\n") + "\n");
