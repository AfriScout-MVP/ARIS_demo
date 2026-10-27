import { beforeAll, describe, expect, it } from "vitest";
import { addCompetition, addCountry, addFederationSeat, addOfficial, addTeam, addUser, api, login, sql, type Session } from "../helpers";
import { FRESH_WITHIN_HOURS, freshness, hoursSince } from "../../src/domain/freshness";

const NOW = Date.parse("2031-06-10T12:00:00Z");

describe("freshness()", () => {
  it("is healthy up to the threshold, stale after it, none without any data", () => {
    expect(freshness("2031-06-10T11:00:00Z", NOW)).toEqual({ health: "healthy", hours: 1 });
    expect(freshness(new Date(NOW - FRESH_WITHIN_HOURS * 3_600_000).toISOString(), NOW)).toEqual({ health: "healthy", hours: FRESH_WITHIN_HOURS });
    expect(freshness(new Date(NOW - (FRESH_WITHIN_HOURS + 1) * 3_600_000).toISOString(), NOW).health).toBe("stale");
    expect(freshness(null, NOW)).toEqual({ health: "none", hours: null });
    expect(freshness("not a date", NOW)).toEqual({ health: "none", hours: null });
    // a clock a little ahead never gives a negative age
    expect(hoursSince("2031-06-10T13:00:00Z", NOW)).toBe(0);
  });
});

let admin: Session;
let seat: Session;
const snap = (s: Session, q = "") => api("GET", `/api/v1/snapshot${q}`, { session: s });
const country = (body: any, code: string) => body.countries.find((c: { code: string }) => c.code === code);

async function match(id: string, code: string, date: string, referee: string) {
  const home = await addTeam(`${code} H`, code);
  const away = await addTeam(`${code} A`, code);
  await sql(
    "INSERT INTO matches (id, league_id, season, home_team_id, away_team_id, match_date, status, referee_id, updated_at) VALUES (?, ?, '2026/2027', ?, ?, ?, 'finished', ?, ?)",
    id, `${code.toLowerCase()}-d1`, home, away, `${date}T18:00:00Z`, referee, `${date}T20:00:00.000Z`,
  ).run();
}

beforeAll(async () => {
  for (const code of ["FSA", "FSB", "FSC"]) {
    await addCountry(code);
    await addCompetition(`${code.toLowerCase()}-d1`, code);
    await addOfficial(`${code}-ref`, code);
    await addOfficial(`${code}-obs`, code);
  }
  const s = await addFederationSeat("FSA");
  await addUser("fs-admin@aris.test", "admin");
  [admin, seat] = await Promise.all([login("fs-admin@aris.test"), login(s.email)]);
  await sql("INSERT INTO evaluation_criteria (key, label, weight, sort) VALUES ('positioning', '{\"fr\":\"P\",\"en\":\"P\"}', 50, 1), ('decisions', '{\"fr\":\"D\",\"en\":\"D\"}', 50, 2)").run();

  // FSA: a report filed just now → up to date. FSB: last touched long ago → stale. FSC: nothing at all → none.
  await match("fs-m1", "FSA", "2020-03-01", "FSA-ref");
  await match("fs-m2", "FSA", "2020-03-08", "FSA-ref");
  await match("fs-m3", "FSA", "2020-03-15", "FSA-ref");
  await match("fs-old", "FSB", "2020-01-01", "FSB-ref");
  const report = (id: string, m: string, marks: Record<string, number>, state = "filed") =>
    sql("INSERT INTO assessments (id, match_id, referee_id, observer_id, state, overall, marks, notes) VALUES (?, ?, 'FSA-ref', 'FSA-obs', ?, 7, ?, '{}')", id, m, state, JSON.stringify(marks)).run();
  await report("fs-a1", "fs-m1", { positioning: 8, decisions: 6 });
  await report("fs-a2", "fs-m2", { positioning: 6, decisions: 9 });
  await report("fs-a3", "fs-m3", { positioning: 7 }, "draft");
  await sql("UPDATE assessments SET updated_at = '2020-01-01T00:00:00.000Z' WHERE match_id IN (SELECT id FROM matches WHERE league_id = 'fsb-d1')").run();
});

describe("snapshot: data freshness per country", () => {
  it("is derived from the latest change to the country's rows, not a stored status", async () => {
    const s = (await snap(admin)).json;
    expect(country(s, "FSA")).toMatchObject({ syncHealth: "healthy", lastSyncHours: 0, lastActivityAt: expect.stringMatching(/^\d{4}-/) });
    expect(country(s, "FSB")).toMatchObject({ syncHealth: "stale", lastActivityAt: "2020-01-01T20:00:00.000Z" });
    expect(country(s, "FSB").lastSyncHours).toBeGreaterThan(FRESH_WITHIN_HOURS);
    // the seeded column said "healthy"; with no data at all the country is honestly "none"
    expect(country(s, "FSC")).toMatchObject({ syncHealth: "none", lastSyncHours: null, lastActivityAt: null });
  });

  it("is scoped like the rest: a federation sees only its own country", async () => {
    const s = (await snap(seat)).json;
    expect(s.countries.map((c: { code: string }) => c.code)).toEqual(["FSA"]);
  });
});

describe("snapshot: criterion averages for the radar", () => {
  it("averages each criterion over the referee's filed reports only", async () => {
    const rows = (await snap(admin)).json.analytics.criterionAverages;
    expect(rows.find((r: { refereeId: string }) => r.refereeId === "FSA-ref")).toEqual({
      refereeId: "FSA-ref",
      reports: 2,
      marks: { positioning: { avg: 7, n: 2 }, decisions: { avg: 7.5, n: 2 } },
    });
    expect(rows.find((r: { refereeId: string }) => r.refereeId === "FSB-ref")).toBeUndefined();
  });

  it("never leaks another country's referees to a federation", async () => {
    await sql("INSERT INTO assessments (id, match_id, referee_id, observer_id, state, overall, marks, notes) VALUES ('fs-b1', 'fs-old', 'FSB-ref', 'FSB-obs', 'filed', 7, '{\"positioning\":5}', '{}')").run();
    const ids = (await snap(seat)).json.analytics.criterionAverages.map((r: { refereeId: string }) => r.refereeId);
    expect(ids).toEqual(["FSA-ref"]);
    expect((await snap(admin)).json.analytics.criterionAverages.map((r: { refereeId: string }) => r.refereeId).sort()).toEqual(["FSA-ref", "FSB-ref"]);
  });
});

describe("snapshot: an explicit range", () => {
  it("adds that range's matches and reports to the most recent ones", async () => {
    // 210 recent matches push the old ones out of the default list
    for (let i = 0; i < 205; i++) await match(`fs-new-${i}`, "FSA", new Date(Date.UTC(2030, 0, 1 + i)).toISOString().slice(0, 10), "FSA-ref");
    const plain = (await snap(admin)).json.matches.map((m: { id: string }) => m.id);
    expect(plain).not.toContain("fs-m1");
    const ranged = await snap(admin, "?from=2020-02-01&to=2020-03-31");
    expect(ranged.status).toBe(200);
    const ids = ranged.json.matches.map((m: { id: string }) => m.id);
    expect(ids).toEqual(expect.arrayContaining(["fs-m1", "fs-m2", "fs-m3", "fs-new-204"]));
    expect(ids).not.toContain("fs-old");
    expect(ranged.json.assessments.map((a: { id: string }) => a.id)).toEqual(expect.arrayContaining(["fs-a1", "fs-a2"]));
    expect(ranged.json.window).toEqual({ from: "2020-02-01", to: "2020-03-31" });
    // a federation's range stays inside its country
    const fed = (await snap(seat, "?from=2020-01-01&to=2020-12-31")).json.matches.map((m: { id: string }) => m.id);
    expect(fed).not.toContain("fs-old");
    expect(fed).toContain("fs-m1");
    for (const q of ["?from=2020-13-01&to=2020-12-31", "?from=2021-02-30&to=2021-03-01", "?from=2020-06-01&to=2020-05-01", "?from=2018-01-01&to=2020-12-31"]) {
      expect((await snap(admin, q)).status, q).toBe(422);
    }
  });
});
