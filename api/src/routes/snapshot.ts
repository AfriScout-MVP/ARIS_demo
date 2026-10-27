import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { ApiError, chunk, marks, parseQuery, today } from "../lib/http";
import { countryFilter } from "../lib/access";
import { requireRole, currentUser } from "../middleware/auth";
import { addDays, loadFixtures } from "../domain/engine-ctx";
import { json, mediaUrl, toAssistant, toReferee, type OfficialRow } from "../domain/mappers";
import { MATCH_SQL, toDecision, toMatch, type DecisionRow, type MatchRow } from "../domain/matches";
import type { Localized } from "../lib/localized";
import { fixtureDto } from "./fixtures";
import { competitionDto, COMPETITION_SQL, type CompetitionRow } from "./competitions";
import { freshness, latestActivitySql } from "../domain/freshness";

export const snapshot = new Hono<AppEnv>();

const MATCH_LIMIT = 200;
const ASSESSMENT_LIMIT = 400;
const DOSSIER_LIMIT = 100;
const TREND_MONTHS = 12;
/** A real calendar day (2026-02-30 is refused, not rolled over). */
const DAY = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d, "Not a calendar day");
/** The widest range one request may ask for. */
const MAX_RANGE_DAYS = 400;
/** Extra matches / reports returned for an explicitly requested range (a calendar month, a picker's "load older"). */
const RANGE_MATCH_LIMIT = 500;
const RANGE_ASSESSMENT_LIMIT = 800;

/** Whole-number percentages that add up to exactly 100 (largest remainder). */
function percentages(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return counts.map(() => 0);
  const raw = counts.map((n) => (n / total) * 100);
  const floor = raw.map(Math.floor);
  let left = 100 - floor.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem);
  for (const { i } of order) {
    if (left <= 0) break;
    floor[i] += 1;
    left -= 1;
  }
  return floor;
}

/**
 * Everything the staff screens read, in one request. A federation seat receives only its own country's data:
 * every list below is filtered in SQL by the caller's country, never fetched whole and trimmed afterwards.
 */
snapshot.get("/", requireRole("admin", "federation"), async (c) => {
  const user = currentUser(c);
  const q = parseQuery(c, z.object({ from: DAY.optional(), to: DAY.optional() }));
  const t = today();
  const from = q.from ?? addDays(t, -21);
  const to = q.to ?? addDays(t, 35);
  if (from > to) throw new ApiError(422, "bad_range", "`from` must not be after `to`");
  if (Date.parse(to) - Date.parse(from) > MAX_RANGE_DAYS * 86_400_000) throw new ApiError(422, "range_too_long", `Ask for at most ${MAX_RANGE_DAYS} days at a time`);
  const db = c.env.DB;

  const byCountry = (column: string) => countryFilter(user, column);
  const cCountry = byCountry("c.code");
  const teamCountry = byCountry("country");
  const compCountry = byCountry("country_code");
  const offCountry = byCountry("o.country_code");
  const matchCountry = byCountry("c.country_code"); // the competition's country
  const fedId = user.role === "federation" ? user.federationId : null;
  const courseScope = fedId ? { sql: "(federation_id IS NULL OR federation_id = ?)", params: [fedId] } : { sql: "1 = 1", params: [] as string[] };
  const trendCountry = user.role === "federation" ? (user.country ?? "") : "";
  const activityCountry = byCountry("cc");

  const [countries, clubs, competitions, officials, matches, breakdown, assessments, licences, fitness, courses, enrolments, dossiers, criteria, availability, trend, activity, criterionMarks, reportCounts] =
    await db.batch<Record<string, unknown>>([
      db
        .prepare(
          `SELECT c.*, f.code AS fed_code, f.name AS fed_name FROM countries c LEFT JOIN federations f ON f.country = c.code
            WHERE ${cCountry.sql} ORDER BY c.code`,
        )
        .bind(...cCountry.params),
      db.prepare(`SELECT country, name FROM teams WHERE kind = 'club' AND ${teamCountry.sql} ORDER BY name COLLATE NOCASE`).bind(...teamCountry.params),
      db.prepare(`${COMPETITION_SQL} WHERE ${compCountry.sql} ORDER BY id`).bind(...compCountry.params),
      db.prepare(`SELECT o.* FROM officials o WHERE o.status <> 'retired' AND ${offCountry.sql} ORDER BY o.name`).bind(...offCountry.params),
      db
        .prepare(`${MATCH_SQL} WHERE ${matchCountry.sql} ORDER BY m.match_date DESC, m.id LIMIT ${MATCH_LIMIT}`)
        .bind(...matchCountry.params),
      // decisions of every visible match (not only the capped list above)
      db
        .prepare(
          `SELECT COALESCE(SUM(CASE WHEN d.final_call = 'overturned' THEN 1 ELSE 0 END), 0) AS overturned,
                  COALESCE(SUM(CASE WHEN d.final_call <> 'overturned' AND d.var_review = 1 THEN 1 ELSE 0 END), 0) AS correctVar,
                  COALESCE(SUM(CASE WHEN d.final_call <> 'overturned' AND d.var_review = 0 THEN 1 ELSE 0 END), 0) AS correct
             FROM match_decisions d JOIN matches m ON m.id = d.match_id LEFT JOIN competitions c ON c.id = m.league_id
            WHERE ${matchCountry.sql}`,
        )
        .bind(...matchCountry.params),
      db
        .prepare(
          `SELECT a.* FROM assessments a JOIN matches m ON m.id = a.match_id LEFT JOIN competitions c ON c.id = m.league_id
            WHERE ${matchCountry.sql} ORDER BY a.updated_at DESC, a.id LIMIT ${ASSESSMENT_LIMIT}`,
        )
        .bind(...matchCountry.params),
      db.prepare(`SELECT l.* FROM licences l JOIN officials o ON o.id = l.official_id WHERE ${offCountry.sql} ORDER BY l.expires, l.id`).bind(...offCountry.params),
      db.prepare(`SELECT f.* FROM fitness_tests f JOIN officials o ON o.id = f.official_id WHERE ${offCountry.sql}`).bind(...offCountry.params),
      // platform-wide courses plus the ones this federation runs itself
      db.prepare(`SELECT * FROM courses WHERE ${courseScope.sql} ORDER BY id`).bind(...courseScope.params),
      db
        .prepare(
          `SELECT e.course_id, e.official_id FROM course_enrolments e JOIN officials o ON o.id = e.official_id
            WHERE ${offCountry.sql} AND e.course_id IN (SELECT id FROM courses WHERE ${courseScope.sql})`,
        )
        .bind(...offCountry.params, ...courseScope.params),
      db
        .prepare(
          `SELECT d.* FROM dossiers d JOIN matches m ON m.id = d.match_id LEFT JOIN competitions c ON c.id = m.league_id
            WHERE ${matchCountry.sql} ORDER BY d.generated DESC, d.id LIMIT ${DOSSIER_LIMIT}`,
        )
        .bind(...matchCountry.params),
      db.prepare("SELECT key, label, weight FROM evaluation_criteria ORDER BY sort, key"),
      db
        .prepare(`SELECT a.official_id, a.date, a.state FROM availability a JOIN officials o ON o.id = a.official_id WHERE a.date BETWEEN ? AND ? AND ${offCountry.sql}`)
        .bind(from, to, ...offCountry.params),
      db
        .prepare(
          `SELECT month, avg_arps FROM (SELECT month, avg_arps FROM performance_history WHERE country_code = ? ORDER BY month DESC LIMIT ${TREND_MONTHS}) ORDER BY month`,
        )
        .bind(trendCountry),
      // data freshness: the latest real change to each visible country's fixtures, crews, matches and reports
      db.prepare(latestActivitySql(activityCountry.sql)).bind(...activityCountry.params),
      // the radar: every filed report's per-criterion marks, averaged per referee (not only the capped list above)
      db
        .prepare(
          `SELECT a.referee_id AS refereeId, j.key AS key, ROUND(AVG(j.value), 2) AS avg, COUNT(*) AS n
             FROM assessments a JOIN matches m ON m.id = a.match_id LEFT JOIN competitions c ON c.id = m.league_id JOIN json_each(a.marks) j
            WHERE a.state = 'filed' AND j.type IN ('integer', 'real') AND ${matchCountry.sql}
            GROUP BY a.referee_id, j.key`,
        )
        .bind(...matchCountry.params),
      db
        .prepare(
          `SELECT a.referee_id AS refereeId, COUNT(*) AS n
             FROM assessments a JOIN matches m ON m.id = a.match_id LEFT JOIN competitions c ON c.id = m.league_id
            WHERE a.state = 'filed' AND ${matchCountry.sql} GROUP BY a.referee_id`,
        )
        .bind(...matchCountry.params),
    ]);

  // An explicit range (the calendar's month, a picker's "load older") also brings that range's matches and reports,
  // on top of the most recent ones every screen relies on.
  const explicit = q.from !== undefined || q.to !== undefined;
  let matchRows = matches.results as unknown as MatchRow[];
  let assessmentRows = assessments.results as Array<Record<string, unknown>>;
  if (explicit) {
    const [rangeMatches, rangeAssessments] = await db.batch<Record<string, unknown>>([
      db
        .prepare(`${MATCH_SQL} WHERE ${matchCountry.sql} AND substr(m.match_date, 1, 10) BETWEEN ? AND ? ORDER BY m.match_date DESC, m.id LIMIT ${RANGE_MATCH_LIMIT}`)
        .bind(...matchCountry.params, from, to),
      db
        .prepare(
          `SELECT a.* FROM assessments a JOIN matches m ON m.id = a.match_id LEFT JOIN competitions c ON c.id = m.league_id
            WHERE ${matchCountry.sql} AND substr(m.match_date, 1, 10) BETWEEN ? AND ? ORDER BY a.updated_at DESC, a.id LIMIT ${RANGE_ASSESSMENT_LIMIT}`,
        )
        .bind(...matchCountry.params, from, to),
    ]);
    const seenM = new Set(matchRows.map((m) => m.id));
    matchRows = [...matchRows, ...(rangeMatches.results as unknown as MatchRow[]).filter((m) => !seenM.has(m.id))].sort(
      (x, y) => y.match_date.localeCompare(x.match_date) || x.id.localeCompare(y.id),
    );
    const seenA = new Set(assessmentRows.map((a) => a.id));
    assessmentRows = [...assessmentRows, ...(rangeAssessments.results as Array<Record<string, unknown>>).filter((a) => !seenA.has(a.id))];
  }

  const fixtureList = await loadFixtures(db, { from, to, scope: user });

  // decisions of the matches that are returned
  const decisionsByMatch = new Map<string, DecisionRow[]>();
  for (const ids of chunk(matchRows.map((m) => m.id))) {
    const { results } = await db
      .prepare(`SELECT * FROM match_decisions WHERE match_id IN (${marks(ids.length)}) ORDER BY match_id, minute`)
      .bind(...ids)
      .all<DecisionRow>();
    for (const d of results) decisionsByMatch.set(d.match_id, [...(decisionsByMatch.get(d.match_id) ?? []), d]);
  }

  const people = officials.results as unknown as OfficialRow[];
  const clubsByCountry = new Map<string, string[]>();
  for (const r of clubs.results as Array<{ country: string; name: string }>) clubsByCountry.set(r.country, [...(clubsByCountry.get(r.country) ?? []), r.name]);
  const enrolled = new Map<string, string[]>();
  for (const e of enrolments.results as Array<{ course_id: string; official_id: string }>) {
    enrolled.set(e.course_id, [...(enrolled.get(e.course_id) ?? []), e.official_id]);
  }

  const lastActivity = new Map((activity.results as Array<{ cc: string; at: string }>).map((r) => [r.cc, r.at]));

  // per referee: how many filed reports, and the mean mark (0–10) of each criterion they were marked on
  const marksByReferee = new Map<string, Record<string, { avg: number; n: number }>>();
  for (const r of criterionMarks.results as Array<{ refereeId: string; key: string; avg: number; n: number }>) {
    marksByReferee.set(r.refereeId, { ...(marksByReferee.get(r.refereeId) ?? {}), [r.key]: { avg: r.avg, n: r.n } });
  }
  const criterionAverages = (reportCounts.results as Array<{ refereeId: string; n: number }>).map((r) => ({
    refereeId: r.refereeId,
    reports: r.n,
    marks: marksByReferee.get(r.refereeId) ?? {},
  }));

  const b = breakdown.results[0] as { correct: number; correctVar: number; overturned: number };
  const counts = [b.correct, b.correctVar, b.overturned];
  const pct = percentages(counts);
  const decisionsBreakdown =
    counts.reduce((a, n) => a + n, 0) === 0
      ? []
      : [
          { id: "correct", value: pct[0] },
          { id: "correct-var", value: pct[1] },
          { id: "overturned", value: pct[2] },
        ];

  return c.json({
    today: t,
    window: { from, to },
    countries: (countries.results as Array<Record<string, unknown>>).map((r) => ({
      code: r.code,
      iso2: r.iso2,
      name: r.name,
      nameFr: r.name_fr,
      nameEs: r.name_es,
      nameDe: r.name_de,
      flag: r.flag,
      flagUrl: mediaUrl(r.flag_media_id as string | null),
      federation: r.fed_code ?? null,
      federationName: r.fed_name ?? null,
      zone: r.zone,
      capital: r.capital,
      timezone: r.timezone,
      currency: r.currency,
      active: r.active === 1,
      syncSource: r.sync_source,
      // derived from the rows themselves (domain/freshness.ts), not from a stored status
      syncHealth: freshness(lastActivity.get(r.code as string)).health,
      lastSyncHours: freshness(lastActivity.get(r.code as string)).hours,
      lastActivityAt: lastActivity.get(r.code as string) ?? null,
      clubs: clubsByCountry.get(r.code as string) ?? [],
    })),
    competitions: (competitions.results as unknown as CompetitionRow[]).map(competitionDto),
    referees: people.filter((p) => p.kind === "referee").map(toReferee),
    assistants: people.filter((p) => p.kind === "assistant").map(toAssistant),
    fixtures: fixtureList.map(fixtureDto),
    matches: matchRows.map((m) => toMatch(m, decisionsByMatch.get(m.id) ?? [], { withHeat: true })),
    assessments: assessmentRows.map((a) => ({
      id: a.id,
      matchId: a.match_id,
      refereeId: a.referee_id,
      observerId: a.observer_id,
      state: a.state,
      filedHoursAfter: a.filed_hours_after,
      published: a.published === 1,
      overall: a.overall,
      marks: json(a.marks as string, {}),
      notes: json<Localized>(a.notes as string, { fr: "", en: "" }),
      clips: json(a.clips as string, []),
    })),
    licences: (licences.results as Array<Record<string, unknown>>).map((l) => ({ id: l.id, refereeId: l.official_id, kind: l.kind, issued: l.issued, expires: l.expires })),
    fitnessTests: (fitness.results as Array<Record<string, unknown>>).map((f) => ({
      refereeId: f.official_id,
      date: f.date,
      test1: { result: f.test1_result, bestSprint: f.best_sprint },
      test2: { result: f.test2_result, laps: f.laps },
      retestDate: f.retest_date,
    })),
    courses: (courses.results as Array<Record<string, unknown>>).map((r) => ({
      id: r.id,
      kind: r.kind,
      name: json<Localized>(r.name as string, { fr: "", en: "" }),
      provider: r.provider,
      federationId: r.federation_id ?? null,
      hours: r.hours,
      state: r.state,
      refereeIds: enrolled.get(r.id as string) ?? [],
    })),
    dossiers: (dossiers.results as Array<Record<string, unknown>>).map((d) => ({ id: d.id, matchId: d.match_id, generated: d.generated, pages: d.pages, recipients: json(d.recipients as string, []), sections: json(d.sections as string, []) })),
    availability: (availability.results as Array<{ official_id: string; date: string; state: string }>).map((a) => ({ officialId: a.official_id, date: a.date, state: a.state })),
    criteria: (criteria.results as Array<{ key: string; label: string; weight: number }>).map((r) => ({ key: r.key, label: json<Localized>(r.label, { fr: "", en: "" }), weight: r.weight })),
    analytics: {
      arpsTrend: (trend.results as Array<{ month: string; avg_arps: number }>).map((r) => ({ month: r.month, score: r.avg_arps })),
      decisionsBreakdown,
      criterionAverages,
    },
  });
});
