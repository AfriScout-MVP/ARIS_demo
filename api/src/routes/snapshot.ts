import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { forbidden, parseQuery, today } from "../lib/http";
import { isStaff } from "../lib/access";
import { currentUser } from "../middleware/auth";
import { addDays, loadFixtures } from "../domain/engine-ctx";
import { json, toAssistant, toReferee, type OfficialRow } from "../domain/mappers";
import { fixtureDto } from "./fixtures";

export const snapshot = new Hono<AppEnv>();

/**
 * Everything the ARIS screens read, in the shapes they already use
 * (site/src/lib/mock-data.ts) — one request, so the app can load once and
 * behave exactly as it does on its demo data.
 */
snapshot.get("/", async (c) => {
  const user = currentUser(c);
  if (!isStaff(user) && user.role !== "observer") throw forbidden("The full snapshot is for the commission and observers");
  const q = parseQuery(c, z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }));
  const t = today();
  const from = q.from ?? addDays(t, -21);
  const to = q.to ?? addDays(t, 35);
  const db = c.env.DB;

  const [countries, competitions, officials, matches, decisions, assessments, licences, fitness, courses, enrolments, dossiers, criteria, availability] = await db.batch<Record<string, unknown>>([
    db.prepare("SELECT * FROM countries ORDER BY code"),
    db.prepare("SELECT * FROM competitions ORDER BY id"),
    db.prepare("SELECT * FROM officials WHERE status <> 'retired' ORDER BY name"),
    db.prepare("SELECT * FROM matches ORDER BY date DESC LIMIT 200"),
    db.prepare("SELECT * FROM match_decisions WHERE match_id IN (SELECT id FROM matches ORDER BY date DESC LIMIT 200) ORDER BY minute"),
    db.prepare("SELECT * FROM assessments WHERE state <> 'draft' OR observer_id IS NOT NULL ORDER BY updated_at DESC LIMIT 400"),
    db.prepare("SELECT * FROM licences ORDER BY expires"),
    db.prepare("SELECT * FROM fitness_tests"),
    db.prepare("SELECT * FROM courses ORDER BY id"),
    db.prepare("SELECT * FROM course_enrolments"),
    db.prepare("SELECT * FROM dossiers ORDER BY generated DESC LIMIT 100"),
    db.prepare("SELECT key, label, weight FROM evaluation_criteria ORDER BY sort, key"),
    db.prepare("SELECT official_id, date, state FROM availability WHERE date BETWEEN ? AND ?").bind(from, to),
  ]);

  const fixtureList = await loadFixtures(db, { from, to });
  const people = officials.results as unknown as OfficialRow[];
  const decisionsByMatch = new Map<string, unknown[]>();
  for (const d of decisions.results as Array<Record<string, unknown>>) {
    const list = decisionsByMatch.get(d.match_id as string) ?? [];
    list.push({
      id: d.id,
      minute: d.minute,
      type: d.type,
      description: json(d.description as string, {}),
      initialCall: d.initial_call,
      varReview: d.var_review === 1,
      finalCall: d.final_call,
      confidence: d.confidence,
      pressureIndex: d.pressure_index,
      distance: d.distance,
      players: json(d.players as string, []),
    });
    decisionsByMatch.set(d.match_id as string, list);
  }
  const enrolled = new Map<string, string[]>();
  for (const e of enrolments.results as Array<{ course_id: string; official_id: string }>) {
    enrolled.set(e.course_id, [...(enrolled.get(e.course_id) ?? []), e.official_id]);
  }

  return c.json({
    today: t,
    window: { from, to },
    countries: (countries.results as Array<Record<string, unknown>>).map((r) => ({
      code: r.code, name: r.name, nameFr: r.name_fr, flag: r.flag, federation: r.federation, zone: r.zone, capital: r.capital,
      syncSource: r.sync_source, syncHealth: r.sync_health, lastSyncHours: r.last_sync_hours, clubs: json(r.clubs as string, []),
    })),
    competitions: (competitions.results as Array<Record<string, unknown>>).map((r) => ({
      id: r.id, countryCode: r.country_code, name: r.name, tier: r.tier, gender: r.gender, matchdays: r.matchdays,
      currentMatchday: r.current_matchday, varEnabled: r.var_enabled === 1, weight: r.weight,
    })),
    referees: people.filter((p) => p.kind === "referee").map(toReferee),
    assistants: people.filter((p) => p.kind === "assistant").map(toAssistant),
    fixtures: fixtureList.map(fixtureDto),
    matches: (matches.results as Array<Record<string, unknown>>).map((m) => ({
      id: m.id, home: m.home, away: m.away, competitionId: m.competition_id, countryCode: m.country_code, date: m.date, score: m.score,
      refereeId: m.referee_id, arpsForMatch: m.arps_for_match, rmcs: m.rmcs, pressureAvg: m.pressure_avg,
      physical: json(m.physical as string, {}), pressureTimeline: json(m.pressure_timeline as string, []), decisions: decisionsByMatch.get(m.id as string) ?? [],
    })),
    assessments: (assessments.results as Array<Record<string, unknown>>).map((a) => ({
      id: a.id, matchId: a.match_id, refereeId: a.referee_id, observerId: a.observer_id, state: a.state, filedHoursAfter: a.filed_hours_after,
      overall: a.overall, marks: json(a.marks as string, {}), notes: json(a.notes as string, {}), clips: json(a.clips as string, []),
    })),
    licences: (licences.results as Array<Record<string, unknown>>).map((l) => ({ id: l.id, refereeId: l.official_id, kind: l.kind, issued: l.issued, expires: l.expires })),
    fitnessTests: (fitness.results as Array<Record<string, unknown>>).map((f) => ({
      refereeId: f.official_id, date: f.date, test1: { result: f.test1_result, bestSprint: f.best_sprint }, test2: { result: f.test2_result, laps: f.laps }, retestDate: f.retest_date,
    })),
    courses: (courses.results as Array<Record<string, unknown>>).map((r) => ({ id: r.id, name: json(r.name as string, {}), provider: r.provider, hours: r.hours, state: r.state, refereeIds: enrolled.get(r.id as string) ?? [] })),
    dossiers: (dossiers.results as Array<Record<string, unknown>>).map((d) => ({ id: d.id, matchId: d.match_id, generated: d.generated, pages: d.pages, recipients: json(d.recipients as string, []) })),
    availability: (availability.results as Array<{ official_id: string; date: string; state: string }>).map((a) => ({ officialId: a.official_id, date: a.date, state: a.state })),
    criteria: (criteria.results as Array<{ key: string; label: string; weight: number }>).map((r) => ({ key: r.key, label: json(r.label, {}), weight: r.weight })),
  });
});
