// Played matches (AfriScout-shaped), the referee's analytics for each, the decision log, observer reports and dossiers.

import { assessments, countries, dossiers, matches, referees } from "../../seed/demo-data";
import { SEASON } from "./geography";
import type { SeedContext } from "./context";
import { jsonCell } from "./sql";

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
  const clubCountry = new Map<string, string>();
  for (const c of countries) for (const club of c.clubs) clubCountry.set(club, c.code);
  const nationCode = new Map(countries.map((c) => [c.name, c.code]));

  const teamFor = (name: string, competitionCountry: string) => {
    if (competitionCountry !== "CAF") return ctx.teams.get(name, competitionCountry);
    const nation = nationCode.get(name);
    if (nation) return ctx.teams.get(name, nation, "national");
    return ctx.teams.get(name, clubCountry.get(name) ?? "EGY");
  };

  const rows = matches.map((m) => {
    const [home, away] = m.score.split(/\s*[-–]\s*/).map(Number);
    return [
      m.id, m.competitionId, SEASON, null,
      teamFor(m.home, m.countryCode), teamFor(m.away, m.countryCode),
      `${ctx.sh(m.date)}T15:00:00Z`, refereeById.get(m.refereeId)?.name ?? null, m.refereeId, home, away, "official", "finished",
    ];
  });
  out.comment("played matches — same columns as AfriScout's matches table");
  out.insert("matches", ["id", "league_id", "season", "matchday", "home_team_id", "away_team_id", "match_date", "referee", "referee_id", "home_score", "away_score", "score_source", "status"], rows);
  out.insert(
    "match_officiating",
    ["match_id", "arps_for_match", "rmcs", "pressure_avg", "physical", "pressure_timeline", "heat_points"],
    matches.map((m) => [m.id, m.arpsForMatch, m.rmcs, m.pressureAvg, jsonCell(m.physical), jsonCell(m.pressureTimeline), jsonCell(heatPoints(m.id))]),
  );
  out.insert(
    "match_decisions",
    ["id", "match_id", "minute", "type", "description", "initial_call", "var_review", "final_call", "confidence", "pressure_index", "distance", "players"],
    matches.flatMap((m) => m.decisions.map((d) => [`${m.id}:${d.id}`, m.id, d.minute, d.type, jsonCell(d.description), d.initialCall, d.varReview, d.finalCall, d.confidence, d.pressureIndex, d.distance, jsonCell(d.players)])),
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
