import { describe, expect, it } from "vitest";
import { addCompetition, addCountry, addFederationSeat, addFixture, addOfficial, addUser, api, login, sql } from "../helpers";

describe("availability and conflicts of interest", async () => {
  await addCountry("OAA", { timezone: "Africa/Nairobi" }); // UTC+3
  await addUser("oa-admin@aris.test", "admin");
  const sa = await addFederationSeat("OAA");
  const sb = await addFederationSeat("OAB");
  await addCompetition("oaa-d1", "OAA");
  await addOfficial("oa-1", "OAA");
  await addOfficial("oa-2", "OAA");
  await addUser("oa-ref1@aris.test", "referee", { officialId: "oa-1" });
  await addUser("oa-ref2@aris.test", "referee", { officialId: "oa-2" });
  const admin = await login("oa-admin@aris.test");
  const ref1 = await login("oa-ref1@aris.test");
  const ref2 = await login("oa-ref2@aris.test");
  const fedA = await login(sa.email);
  const fedB = await login(sb.email);
  const put = (s: typeof ref1 | null, id: string, body: object) => api("PUT", `/api/v1/officials/${id}/availability`, { session: s, body });

  // 22:30 UTC on 2036-03-03 is 01:30 on 2036-03-04 in Nairobi
  await addFixture("oa-fx", { country: "OAA", competition: "oaa-d1", date: "2036-03-03", time: "22:30", roles: ["R"] });
  await sql("UPDATE designations SET official_id = 'oa-1', state = 'confirmed' WHERE fixture_id = 'oa-fx'").run();

  it("lets an official declare days off; a reason is required for unavailability", async () => {
    expect((await put(ref1, "oa-1", { dates: ["2036-05-01"], state: "unavailable" })).json.error.code).toBe("reason_required");
    const ok = await put(ref1, "oa-1", { dates: ["2036-05-01", "2036-05-02"], state: "unavailable", reason: "leave" });
    expect(ok.status).toBe(200);
    expect(ok.json).toMatchObject({ declared: 2, conflicts: [] });
    expect((await put(ref1, "oa-1", { dates: ["2036-05-02"], state: "resting" })).status).toBe(200);
    const got = await api("GET", "/api/v1/officials/oa-1/availability?from=2036-05-01&to=2036-05-31", { session: fedA });
    expect(got.json.declared).toEqual([
      { date: "2036-05-01", state: "unavailable", reason: "leave", note: null },
      { date: "2036-05-02", state: "resting", reason: null, note: null },
    ]);
    expect((await api("DELETE", "/api/v1/officials/oa-1/availability/2036-05-01", { session: ref1 })).status).toBe(200);
    expect((await api("DELETE", "/api/v1/officials/oa-1/availability/yesterday", { session: ref1 })).status).toBe(422);
    expect((await put(ref1, "oa-1", { dates: [], state: "resting" })).status).toBe(422);
  });

  it("shows designations on the venue's local calendar", async () => {
    const res = await api("GET", "/api/v1/officials/oa-1/availability?from=2036-03-01&to=2036-03-10", { session: ref1 });
    expect(res.json.designations).toHaveLength(1);
    expect(res.json.designations[0]).toMatchObject({ fixtureId: "oa-fx", date: "2036-03-04", kickoff: "01:30", kickoffAt: "2036-03-03T22:30:00Z", role: "R", state: "confirmed" });
    const outside = await api("GET", "/api/v1/officials/oa-1/availability?from=2036-03-01&to=2036-03-03", { session: ref1 });
    expect(outside.json.designations).toEqual([]);
  });

  it("warns the federation of that country (and admins), on the local date of the match", async () => {
    // the UTC date (03-03) is not the match day for Nairobi: no clash
    expect((await put(ref1, "oa-1", { dates: ["2036-03-03"], state: "unavailable", reason: "work" })).json.conflicts).toEqual([]);
    const res = await put(ref1, "oa-1", { dates: ["2036-03-04"], state: "unavailable", reason: "work" });
    expect(res.status).toBe(200);
    expect(res.json.conflicts).toHaveLength(1);
    expect(res.json.conflicts[0]).toMatchObject({ fixtureId: "oa-fx", role: "R", date: "2036-03-04" });
    const alerts = (s: typeof ref1) => api("GET", "/api/v1/notifications", { session: s });
    expect(JSON.stringify((await alerts(fedA)).json)).toContain("Designated official now unavailable");
    expect(JSON.stringify((await alerts(admin)).json)).toContain("Designated official now unavailable");
    expect(JSON.stringify((await alerts(fedB)).json)).not.toContain("Designated official now unavailable");
    expect(JSON.stringify((await alerts(ref1)).json)).not.toContain("Designated official now unavailable");
  });

  it("is private to the official and their federation", async () => {
    expect((await put(ref2, "oa-1", { dates: ["2036-06-01"], state: "resting" })).status).toBe(403);
    expect((await put(fedB, "oa-1", { dates: ["2036-06-01"], state: "resting" })).status).toBe(404);
    expect((await put(null, "oa-1", { dates: ["2036-06-01"], state: "resting" })).status).toBe(401);
    expect((await put(fedA, "oa-1", { dates: ["2036-06-01"], state: "resting" })).status).toBe(200);
    expect((await put(admin, "oa-2", { dates: ["2036-06-01"], state: "resting" })).status).toBe(200);
    expect((await api("GET", "/api/v1/officials/oa-1/availability", { session: ref2 })).status).toBe(403);
    expect((await api("GET", "/api/v1/officials/oa-1/availability", { session: fedB })).status).toBe(404);
    expect((await api("DELETE", "/api/v1/officials/oa-1/availability/2036-06-01", { session: fedB })).status).toBe(404);
    expect((await sql("SELECT COUNT(*) AS n FROM availability WHERE official_id = 'oa-1' AND date = '2036-06-01'").first<{ n: number }>())!.n).toBe(1);
  });

  it("records conflicts of interest: declared by the official, removed by them or the federation of the country", async () => {
    const decl = await api("POST", "/api/v1/officials/oa-1/conflicts", { session: ref1, body: { kind: "country", subject: "oab", note: "Born there" } });
    expect(decl.status).toBe(201);
    expect(decl.json.conflict).toMatchObject({ kind: "country", subject: "OAB" });
    expect((await api("POST", "/api/v1/officials/oa-1/conflicts", { session: ref1, body: { kind: "country", subject: "OAB" } })).status).toBe(409);
    expect((await api("POST", "/api/v1/officials/oa-1/conflicts", { session: ref2, body: { kind: "club", subject: "Some FC" } })).status).toBe(403);
    expect((await api("POST", "/api/v1/officials/oa-1/conflicts", { session: fedB, body: { kind: "club", subject: "Some FC" } })).status).toBe(404);
    expect((await api("POST", "/api/v1/officials/oa-1/conflicts", { session: ref1, body: { kind: "club", subject: "x" } })).status).toBe(422);
    const named = await api("POST", "/api/v1/officials/oa-1/conflicts", { session: ref1, body: { kind: "country", subject: "Senegal" } });
    expect([named.status, named.json.error.code]).toEqual([422, "unknown_country"]);
    const id = decl.json.conflict.id as string;
    // another referee may not touch it (403), another country does not see it (404)
    expect((await api("DELETE", `/api/v1/officials/oa-1/conflicts/${id}`, { session: ref2 })).status).toBe(403);
    expect((await api("DELETE", `/api/v1/officials/oa-1/conflicts/${id}`, { session: fedB })).status).toBe(404);
    expect((await api("DELETE", `/api/v1/officials/oa-1/conflicts/nope`, { session: fedA })).status).toBe(404);
    expect((await api("DELETE", `/api/v1/officials/oa-1/conflicts/${id}`, { session: fedA })).status).toBe(200);
    expect((await sql("SELECT COUNT(*) AS n FROM conflicts_of_interest WHERE official_id = 'oa-1'").first<{ n: number }>())!.n).toBe(0);
    // the official withdraws their own declaration
    const own = (await api("POST", "/api/v1/officials/oa-1/conflicts", { session: ref1, body: { kind: "club", subject: "Former Club" } })).json.conflict.id as string;
    expect((await api("DELETE", `/api/v1/officials/oa-1/conflicts/${own}`, { session: ref1 })).status).toBe(200);
    expect((await api("DELETE", `/api/v1/officials/oa-1/conflicts/${own}`, { session: ref1 })).status).toBe(404);
    const audit = await sql("SELECT actor_role AS role FROM audit_log WHERE action = 'conflict.remove' AND entity_id = 'oa-1' ORDER BY id DESC LIMIT 1").first<{ role: string }>();
    expect(audit?.role).toBe("referee");
  });

  it("lets an official withdraw their own declared days, today or later, never another's", async () => {
    const day = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const past = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
    expect((await put(ref1, "oa-1", { dates: [day], state: "resting" })).status).toBe(200);
    await sql("INSERT INTO availability (official_id, date, state) VALUES ('oa-1', ?, 'resting')", past).run();
    expect((await api("GET", `/api/v1/officials/oa-1/availability?from=${past}&to=${day}`, { session: ref1 })).json.declared.map((d: { date: string }) => d.date)).toEqual([past, day]);
    expect((await api("DELETE", `/api/v1/officials/oa-1/availability/${day}`, { session: ref2 })).status).toBe(403);
    expect((await api("DELETE", `/api/v1/officials/oa-1/availability/${day}`, { session: fedB })).status).toBe(404);
    expect((await api("DELETE", `/api/v1/officials/oa-1/availability/${day}`, { session: null })).status).toBe(401);
    const old = await api("DELETE", `/api/v1/officials/oa-1/availability/${past}`, { session: ref1 });
    expect([old.status, old.json.error.code]).toEqual([409, "past_date"]);
    expect((await api("DELETE", `/api/v1/officials/oa-1/availability/${day}`, { session: ref1 })).status).toBe(200);
    expect((await api("DELETE", `/api/v1/officials/oa-1/availability/${day}`, { session: ref1 })).status).toBe(404);
    // staff may still correct the record of a past day
    expect((await api("DELETE", `/api/v1/officials/oa-1/availability/${past}`, { session: fedA })).status).toBe(200);
    const audit = await sql("SELECT before FROM audit_log WHERE action = 'availability.clear' AND entity_id = 'oa-1' ORDER BY id DESC LIMIT 1").first<{ before: string }>();
    expect(JSON.parse(audit!.before)).toMatchObject({ date: past, state: "resting" });
  });
});
