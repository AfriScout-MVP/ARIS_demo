// Played matches (AfriScout-shaped), the referee's analytics for each, the decision log, observer reports and dossiers.

import { assessments, countries, dossiers, fixtureById, fixtureNations, matches, referees, type DecisionType, type MatchDecision } from "../../seed/demo-data";
import { toUtcIso } from "../../src/lib/time";
import { SEASON } from "./geography";
import type { SeedContext } from "./context";
import { jsonCell } from "./sql";

/**
 * The demo data's narrative `DecisionType` ("Penalty", "Red Card", ...) predates the referee-decision taxonomy
 * (migration 0017) and still drives the demo's description bank and report copy (see ../../seed/demo-data.ts) —
 * no need to disturb that. This maps each one onto a real `(event_type, sub_event, outcome)` leaf so the rows
 * this script writes satisfy match_decisions' CHECK constraint and read naturally once tagged.
 */
const EVENT_TYPE_OF: Record<DecisionType, string> = {
  Penalty: "penalty_decision",
  Handball: "penalty_decision",
  "Red Card": "card",
  "Yellow Card": "card",
  Offside: "offside_call",
  Foul: "foul_advantage",
};
const SUB_EVENT_OF: Record<DecisionType, string> = {
  Penalty: "direct_foul",
  Handball: "handball",
  "Red Card": "red",
  "Yellow Card": "yellow",
  Offside: "attacking_phase",
  Foul: "foul_given",
};

/** The outcome leaf for one generated decision, from its narrative type and its on-field / VAR calls. */
function outcomeOf(d: MatchDecision): string {
  const overturned = d.finalCall === "overturned";
  switch (d.type) {
    case "Penalty":
      return d.initialCall === "given" ? (overturned ? "given_overturned" : "given") : overturned ? "not_given_overturned" : "not_given";
    case "Handball":
      return d.initialCall === "given" ? "given" : "not_given";
    case "Offside":
      return overturned ? "overturned" : d.initialCall === "given" ? "flagged" : "play_on";
    case "Red Card":
    case "Yellow Card":
      return overturned ? "rescinded" : "issued";
    case "Foul":
      return "confirmed";
  }
}

const hash = (s: string) => [...s].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261);

/** Referee presence samples on a 105 × 68 pitch — the same procedure the demo used, now stored with the match. */
function heatPoints(matchId: string) {
  let seed = hash(matchId + "heat");
  const r = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const round = (n: number) => Math.round(n * 100) / 100;
  const bell = () => (r() + r() + r() - 1.5) / 1.5;
  return Array.from({ length: 420 }, () => {
    const x = Math.max(1.5, Math.min(103.5, r() * 105));
    const y = Math.max(2, Math.min(66, 10 + (x / 105) * 48 + bell() * 13));
    return { x: round(x), y: round(y), intensity: round(0.35 + r() * 0.65) };
  });
}

export function writeMatches(ctx: SeedContext) {
  const out = ctx.sql.section("matches");
  const refereeById = new Map(referees.map((r) => [r.id, r]));
  const nationNames = new Set(countries.map((c) => c.name));

  // the same team ids the fixture used: a continental tie's sides belong to their own nations
  const teamFor = (name: string, fixtureId: string, side: 0 | 1, competitionCountry: string) => {
    const country = competitionCountry === "CAF" ? fixtureNations.get(fixtureId)![side] : competitionCountry;
    return ctx.teams.get(name, country, nationNames.has(name) ? "national" : "club");
  };

  const rows = matches.map((m) => {
    const [home, away] = m.score.split(/\s*[-–]\s*/).map(Number);
    const f = fixtureById.get(m.fixtureId)!;
    const host = m.countryCode === "CAF" ? fixtureNations.get(m.fixtureId)![0] : m.countryCode;
    return [
      m.id, m.competitionId, SEASON, String(f.matchday),
      teamFor(m.home, m.fixtureId, 0, m.countryCode), teamFor(m.away, m.fixtureId, 1, m.countryCode),
      toUtcIso(ctx.sh(m.date), m.kickoff, ctx.timezone(host)), m.venue, refereeById.get(m.refereeId)?.name ?? null, m.refereeId,
      home, away, "official", "finished", m.attendance, jsonCell(m.weather), m.fixtureId,
    ];
  });
  out.comment("played matches — same columns as AfriScout's matches table, each linked to the fixture it was played as");
  out.insert(
    "matches",
    ["id", "league_id", "season", "matchday", "home_team_id", "away_team_id", "match_date", "venue", "referee", "referee_id", "home_score", "away_score", "score_source", "status", "attendance", "weather_conditions", "fixture_id"],
    rows,
  );
  out.insert(
    "match_officiating",
    ["match_id", "arps_for_match", "rmcs", "pressure_avg", "physical", "pressure_timeline", "heat_points"],
    matches.map((m) => [m.id, m.arpsForMatch, m.rmcs, m.pressureAvg, jsonCell(m.physical), jsonCell(m.pressureTimeline), jsonCell(heatPoints(m.id))]),
  );
  out.insert(
    "match_decisions",
    ["id", "match_id", "minute", "type", "sub_event", "outcome", "description", "initial_call", "var_review", "final_call", "confidence", "pressure_index", "distance", "players"],
    matches.flatMap((m) =>
      m.decisions.map((d) => [`${m.id}:${d.id}`, m.id, d.minute, EVENT_TYPE_OF[d.type], SUB_EVENT_OF[d.type], outcomeOf(d), jsonCell(d.description), d.initialCall, d.varReview, d.finalCall, d.confidence, d.pressureIndex, d.distance, jsonCell(d.players)]),
    ),
  );

  // the observer on a report is an official; only referees act as observers in the demo data
  const refereeIds = new Set(referees.map((r) => r.id));
  const reports = assessments.filter((a) => refereeIds.has(a.observerId) && refereeIds.has(a.refereeId));
  out.insert(
    "assessments",
    ["id", "match_id", "referee_id", "observer_id", "state", "filed_hours_after", "published", "overall", "marks", "notes", "clips"],
    reports.map((a) => [a.id, a.matchId, a.refereeId, a.observerId, a.state, a.filedHoursAfter, a.state === "filed", a.overall, jsonCell(a.marks), jsonCell(a.notes), jsonCell(a.clips)]),
  );
  out.insert(
    "dossiers",
    ["id", "match_id", "generated", "pages", "recipients"],
    dossiers.map((d) => [d.id, d.matchId, ctx.sh(d.generated), d.pages, jsonCell(d.recipients)]),
  );
}
