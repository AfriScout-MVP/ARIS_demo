import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { runDaily, runFrequent, runScheduled } from "../../src/cron";
import { addCompetition, addCountry, addFederationSeat, addFixture, addOfficial, addUser, api, login, sql, type Session } from "../helpers";

let admin: Session;
let egy: Session;
let referee: Session;
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  await addCountry("EGY");
  await addCountry("MAR");
  await addOfficial("lic-egy", "EGY");
  await addOfficial("lic-mar", "MAR");
  await addUser("lic-egy@aris.test", "referee", { officialId: "lic-egy" });
  await addUser("admin@aris.test", "admin");
  await addFederationSeat("MAR");
  egy = await login((await addFederationSeat("EGY")).email);
  admin = await login("admin@aris.test");
  referee = await login("lic-egy@aris.test");
});

const licence = (id: string, official: string, expires: string) =>
  sql("INSERT INTO licences (id, official_id, kind, issued, expires) VALUES (?, ?, 'FIFA Badge', '2020-01-01', ?)", id, official, expires).run();

describe("licence expiry alerts", () => {
  it("raises one federation alert per licence, addressed to that licence's country, however often the job runs", async () => {
    const soon = inDays(20);
    await licence("l-egy", "lic-egy", soon);
    await licence("l-mar", "lic-mar", inDays(-5));
    await licence("l-far", "lic-egy", inDays(300));
    const first = await runDaily(env);
    await runDaily(env);
    expect(first.licences).toBe(2);

    const { results } = await env.DB.prepare("SELECT audience_role, country_code, user_id, tone FROM notifications WHERE dedupe_key LIKE 'licence:%' ORDER BY dedupe_key").all<Record<string, string | null>>();
    const staff = results.filter((r) => r.audience_role);
    expect(staff).toEqual(expect.arrayContaining([
      expect.objectContaining({ audience_role: "federation", country_code: "EGY", tone: "amber" }),
      expect.objectContaining({ audience_role: "federation", country_code: "MAR", tone: "red" }),
    ]));
    expect(staff).toHaveLength(2); // never role-wide without a country, never repeated
    expect(results.filter((r) => r.user_id)).toHaveLength(1); // the official with an account
    const n = await sql("SELECT COUNT(*) AS n FROM notifications WHERE dedupe_key = 'licence:l-egy:' || substr(?, 1, 7)", new Date().toISOString().slice(0, 7)).first<{ n: number }>();
    expect(n!.n).toBe(1);
  });

  it("shows the alert to the federation of that country only", async () => {
    const mine = await api("GET", "/api/v1/notifications", { session: egy });
    const text = JSON.stringify(mine.json);
    expect(text).toContain("FIFA Badge");
    expect(text).not.toContain("lic-mar");
  });

  it("is reachable on demand by the admin only", async () => {
    expect((await api("POST", "/api/v1/admin/run-jobs", { session: admin })).status).toBe(200);
    expect((await api("POST", "/api/v1/admin/run-jobs", { session: egy })).status).toBe(403);
    expect((await api("POST", "/api/v1/admin/run-jobs", { session: referee })).status).toBe(403);
    expect((await api("POST", "/api/v1/admin/run-jobs")).status).toBe(401);
  });
});

describe("the other daily and frequent jobs", () => {
  it("reminds crews that are still open three days out: the federation of the fixture, or the admins for a continental tie", async () => {
    await addCompetition("egy-d1", "EGY");
    await addCompetition("caf-cl", "CAF", { tier: "continental" });
    const soon = inDays(2);
    await addFixture("cron-egy", { country: "EGY", competition: "egy-d1", date: soon, roles: ["R"] });
    await addFixture("cron-caf", { country: "CAF", competition: "caf-cl", date: soon, home: "Al Ahly", away: "Raja", homeCode: "EGY", awayCode: "MAR", roles: ["R"] });
    const res = await runDaily(env);
    expect(res.unconfirmed).toBeGreaterThanOrEqual(2);
    expect(await sql("SELECT audience_role, country_code FROM notifications WHERE dedupe_key LIKE 'unconfirmed:cron-egy:%'").first()).toEqual({ audience_role: "federation", country_code: "EGY" });
    expect(await sql("SELECT audience_role, country_code FROM notifications WHERE dedupe_key LIKE 'unconfirmed:cron-caf:%'").first()).toEqual({ audience_role: "admin", country_code: null });
  });

  it("reminds an official of a designation still awaiting their answer, once a day", async () => {
    await sql("UPDATE designations SET official_id = 'lic-egy', state = 'pending' WHERE fixture_id = 'cron-egy' AND role = 'R'").run();
    await runDaily(env);
    await runDaily(env);
    const n = await sql("SELECT COUNT(*) AS n FROM notifications WHERE dedupe_key LIKE 'awaiting:cron-egy:R:%'").first<{ n: number }>();
    expect(n!.n).toBe(1);
  });

  it("flags a match whose observer report is more than 48 hours late", async () => {
    await addFixture("cron-late", { country: "EGY", competition: "egy-d1", date: "2020-01-01", roles: ["R", "OBS"], round: 9 });
    await addOfficial("lic-obs", "EGY");
    await sql("UPDATE designations SET official_id = 'lic-obs', state = 'confirmed' WHERE fixture_id = 'cron-late' AND role = 'OBS'").run();
    await sql("INSERT INTO matches (id, home_team_id, away_team_id, match_date, fixture_id) SELECT 'm-late', home_team_id, away_team_id, kickoff_at, id FROM fixtures WHERE id = 'cron-late'").run();
    await sql("INSERT INTO assessments (id, match_id, referee_id, observer_id, state, overall, marks, notes) VALUES ('a-late', 'm-late', 'lic-egy', 'lic-obs', 'draft', 0, '{}', '{}')").run();
    const res = await runDaily(env);
    expect(res.overdueReports).toBeGreaterThanOrEqual(1);
    expect(await sql("SELECT state FROM assessments WHERE id = 'a-late'").first()).toEqual({ state: "overdue" });
    expect(await sql("SELECT audience_role, country_code FROM notifications WHERE dedupe_key = 'obs-overdue:m-late'").first()).toEqual({ audience_role: "federation", country_code: "EGY" });
  });

  it("drains the outbox without a webhook by leaving messages queued, and dispatches by cron expression", async () => {
    expect(await runFrequent(env)).toEqual({ outbox: expect.objectContaining({ skipped: true }) });
    expect(await runScheduled("*/15 * * * *", env)).toHaveProperty("outbox");
    expect(await runScheduled("0 5 * * *", env)).toHaveProperty("licences");
  });
});
