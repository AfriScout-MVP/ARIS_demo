// Played matches as the app consumes them. The `matches` table keeps AfriScout's columns (see migrations/0006),
// so this is the one place that turns a row back into the app's `MatchRecord`.

import { json } from "./mappers";
import type { Localized } from "../lib/localized";

/** Select the AfriScout-shaped row plus the team names, the competition's country and the ARIS analytics. */
export const MATCH_SQL = `
  SELECT m.id, m.fixture_id, m.league_id AS competition_id, c.country_code, m.season, m.matchday, m.match_date, m.venue, m.status,
         m.home_score, m.away_score, m.attendance, m.weather_conditions, m.referee_id,
         ht.name AS home, at.name AS away,
         o.arps_for_match, o.rmcs, o.pressure_avg, o.physical, o.pressure_timeline, o.heat_points
    FROM matches m
    JOIN teams ht ON ht.id = m.home_team_id
    JOIN teams at ON at.id = m.away_team_id
    LEFT JOIN competitions c ON c.id = m.league_id
    LEFT JOIN match_officiating o ON o.match_id = m.id`;

export interface MatchRow {
  id: string;
  fixture_id: string | null;
  competition_id: string | null;
  country_code: string | null;
  season: string | null;
  matchday: string | null;
  match_date: string;
  venue: string | null;
  status: string;
  home_score: number | null;
  away_score: number | null;
  attendance: number | null;
  weather_conditions: string | null;
  referee_id: string | null;
  home: string;
  away: string;
  arps_for_match: number | null;
  rmcs: number | null;
  pressure_avg: number | null;
  physical: string | null;
  pressure_timeline: string | null;
  heat_points: string | null;
}

export interface DecisionRow {
  id: string;
  match_id: string;
  minute: number;
  type: string;
  sub_event: string | null;
  outcome: string | null;
  description: string;
  initial_call: string;
  var_review: number;
  final_call: string;
  confidence: number;
  pressure_index: number;
  distance: number;
  players: string;
  tagged_by: string | null;
}

/** "2–1", or "" until the score is known. */
export const scoreText = (home: number | null, away: number | null) => (home == null || away == null ? "" : `${home}–${away}`);

export function toDecision(d: DecisionRow) {
  return {
    id: d.id,
    minute: d.minute,
    eventType: d.type,
    subEvent: d.sub_event,
    outcome: d.outcome,
    description: json<Localized>(d.description, { fr: "", en: "" }),
    initialCall: d.initial_call,
    varReview: d.var_review === 1,
    finalCall: d.final_call,
    confidence: d.confidence,
    pressureIndex: d.pressure_index,
    distance: d.distance,
    players: json<string[]>(d.players, []),
  };
}

export function toMatch(m: MatchRow, decisions: DecisionRow[] = [], opts: { withHeat?: boolean } = {}) {
  return {
    id: m.id,
    fixtureId: m.fixture_id,
    home: m.home,
    away: m.away,
    competitionId: m.competition_id,
    countryCode: m.country_code,
    season: m.season,
    matchday: m.matchday,
    date: m.match_date.slice(0, 10),
    venue: m.venue,
    status: m.status,
    homeScore: m.home_score,
    awayScore: m.away_score,
    score: scoreText(m.home_score, m.away_score),
    attendance: m.attendance,
    // as recorded ({condition, temperatureC, humidity}); null when nobody entered it
    weather: json<Record<string, unknown> | null>(m.weather_conditions, null),
    refereeId: m.referee_id,
    arpsForMatch: m.arps_for_match ?? 0,
    rmcs: m.rmcs ?? 0,
    pressureAvg: m.pressure_avg ?? 0,
    physical: json<Record<string, number>>(m.physical, {}),
    pressureTimeline: json<unknown[]>(m.pressure_timeline, []),
    ...(opts.withHeat ? { heatPoints: json<unknown[]>(m.heat_points, []) } : {}),
    decisions: decisions.map(toDecision),
  };
}
