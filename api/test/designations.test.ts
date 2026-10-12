import { beforeAll, describe, expect, it } from "vitest";
import { addCompetition, addCountry, addFixture, addOfficial, addUser, api, login, sql, uid, type Session } from "./helpers";

let admin: Session;
let commission: Session;
let egyOnly: Session;
let refereeSession: Session;
let observer: Session;

// A unique day per test keeps rest-day and double-booking rules from leaking between them.
let day = 0;
const nextDate = () => {
  day += 10;
  return new Date(Date.UTC(2031, 0, 1 + day)).toISOString().slice(0, 10);
};
const shift = (iso: string, n: number) => new Date(new Date(`${iso}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

const put = (s: Session, fx: string, role: string, body: object) => api("PUT", `/api/v1/fixtures/${fx}/designations/${role}`, { session: s, body });

beforeAll(async () => {
  await addCountry("EGY", "UNAF");
  await addCountry("MAR", "UNAF");
  await addCountry("NGA", "UFOA-B");
  await addCompetition("egy-d1", "EGY");
  await addCompetition("caf-cl", "CAF", { tier: "continental", varEnabled: true });
  await addOfficial("egy-ref-1", "EGY");
  await addUser("admin@aris.test", "admin");
  await addUser("commission@aris.test", "commission");
  await addUser("egy@aris.test", "commission", { scope: "country:EGY" });
  await addUser("referee@aris.test", "referee", { officialId: "egy-ref-1" });
  await addUser("observer@aris.test", "observer", { officialId: "egy-ref-1" });
  [admin, commission, egyOnly, refereeSession, observer] = await Promise.all(
    ["admin", "commission", "egy", "referee", "observer"].map((n) => login(`${n}@aris.test`)),
  );
});

async function domestic(opts: { roles?: string[] } = {}) {
  const id = uid("fx");
  const date = nextDate();
  await addFixture(id, { country: "EGY", competition: "egy-d1", date, roles: opts.roles });
  return { id, date };
}

describe("who may designate", () => {
  it("refuses referees and observers", async () => {
    const { id } = await domestic();
    expect((await put(refereeSession, id, "R", { officialId: "egy-ref-1" })).status).toBe(403);
    expect((await put(observer, id, "R", { officialId: "egy-ref-1" })).status).toBe(403);
  });

  it("keeps a country-scoped commission inside its country", async () => {
    const morocco = uid("fx");
    await addFixture(morocco, { country: "MAR", competition: "egy-d1", date: nextDate() });
    const res = await put(egyOnly, morocco, "R", { officialId: "egy-ref-1" });
    expect(res.status).toBe(403);
    const own = await domestic();
    const ok = await put(egyOnly, own.id, "R", { officialId: "egy-ref-1" });
    expect(ok.status).toBe(200);
  });
});

describe("designation rules", () => {
  it("assigns an eligible official and records who, when and what", async () => {
    const { id } = await domestic();
    const res = await put(commission, id, "R", { officialId: "egy-ref-1" });
    expect(res.status).toBe(200);
    const slot = res.json.fixture.crew.find((s: { role: string }) => s.role === "R");
    expect(slot).toMatchObject({ officialId: "egy-ref-1", state: "pending", version: 2 });

    const hist = await api("GET", `/api/v1/fixtures/${id}/history`, { session: commission });
    expect(hist.json.history[0]).toMatchObject({ role: "R", action: "assign", toOfficialId: "egy-ref-1", actorKind: "user" });
  });

  it("blocks an official from outside the home list, but lets staff override with a reason", async () => {
    await addOfficial("mar-ref-pool", "MAR");
    const { id } = await domestic();
    const blocked = await put(commission, id, "R", { officialId: "mar-ref-pool" });
    expect(blocked.status).toBe(409);
    expect(blocked.json.error.details).toMatchObject({ blockers: ["pool"], overridable: true });

    const noReason = await put(commission, id, "R", { officialId: "mar-ref-pool", override: true });
    expect(noReason.status).toBe(422);
    const ok = await put(commission, id, "R", { officialId: "mar-ref-pool", override: true, reason: "No Egyptian referee free that week" });
    expect(ok.status).toBe(200);
  });

  it("never lets a nation referee its own team in a continental tie", async () => {
    await addOfficial("egy-ref-cl", "EGY");
    await addOfficial("nga-ref-cl", "NGA");
    const id = uid("fx");
    await addFixture(id, { country: "CAF", competition: "caf-cl", date: nextDate(), home: "Al Ahly", away: "Wydad AC", homeCode: "EGY", awayCode: "MAR" });
    const res = await put(commission, id, "R", { officialId: "egy-ref-cl", override: true, reason: "trying to waive it" });
    expect(res.status).toBe(409);
    expect(res.json.error.details).toMatchObject({ blockers: ["neutrality"], overridable: false });
    expect((await put(commission, id, "R", { officialId: "nga-ref-cl" })).status).toBe(200);
  });

  it("refuses a suspended official and an unqualified VAR", async () => {
    await addOfficial("egy-ref-susp", "EGY", { status: "suspended" });
    await addOfficial("egy-ref-novar", "EGY");
    const id = uid("fx");
    await addFixture(id, { country: "EGY", competition: "egy-d1", date: nextDate(), roles: ["R", "VAR"] });
    const susp = await put(commission, id, "R", { officialId: "egy-ref-susp" });
    expect(susp.json.error.details.blockers).toContain("qualification");
    expect(susp.json.error.details.overridable).toBe(false);
    const novar = await put(commission, id, "VAR", { officialId: "egy-ref-novar" });
    expect(novar.json.error.details.blockers).toContain("qualification");
  });

  it("detects a double booking on the same day", async () => {
    await addOfficial("egy-ref-busy", "EGY");
    const date = nextDate();
    const a = uid("fx");
    const b = uid("fx");
    await addFixture(a, { country: "EGY", competition: "egy-d1", date });
    await addFixture(b, { country: "EGY", competition: "egy-d1", date });
    expect((await put(commission, a, "R", { officialId: "egy-ref-busy" })).status).toBe(200);
    const second = await put(commission, b, "R", { officialId: "egy-ref-busy" });
    expect(second.status).toBe(409);
    expect(second.json.error.details.blockers).toContain("double");
    expect(second.json.error.details.overridable).toBe(false);
  });

  it("flags too little rest, declared unavailability and conflicts of interest", async () => {
    await addOfficial("egy-ref-tired", "EGY");
    await addOfficial("egy-ref-away", "EGY");
    await addOfficial("egy-ref-fan", "EGY");
    const date = nextDate();
    const before = uid("fx");
    await addFixture(before, { country: "EGY", competition: "egy-d1", date: shift(date, -1) });
    await put(commission, before, "R", { officialId: "egy-ref-tired" });

    await api("PUT", "/api/v1/officials/egy-ref-away/availability", { session: commission, body: { dates: [date], state: "unavailable", reason: "leave" } });
    await api("POST", "/api/v1/officials/egy-ref-fan/conflicts", { session: commission, body: { kind: "club", subject: "Home FC" } });

    const target = uid("fx");
    await addFixture(target, { country: "EGY", competition: "egy-d1", date });
    expect((await put(commission, target, "R", { officialId: "egy-ref-tired" })).json.error.details.blockers).toContain("rest");
    expect((await put(commission, target, "R", { officialId: "egy-ref-away" })).json.error.details.blockers).toContain("unavailable");
    expect((await put(commission, target, "R", { officialId: "egy-ref-fan" })).json.error.details.blockers).toContain("conflict");
  });

  it("rejects stale writes with the row version", async () => {
    await addOfficial("egy-ref-v1", "EGY");
    await addOfficial("egy-ref-v2", "EGY");
    const { id } = await domestic();
    const first = await put(commission, id, "R", { officialId: "egy-ref-v1" });
    const version = first.json.fixture.crew.find((s: { role: string }) => s.role === "R").version;
    const stale = await put(commission, id, "R", { officialId: "egy-ref-v2", expectedVersion: version - 1, reason: "swap" });
    expect(stale.status).toBe(409);
    expect(stale.json.error.code).toBe("stale");
  });
});

describe("the designation workflow", () => {
  it("runs draft → awaiting confirmation → validated → published, and demands a reason to change it", async () => {
    await addOfficial("wf-r", "EGY");
    await addOfficial("wf-a1", "EGY", { kind: "assistant" });
    await addOfficial("wf-a2", "EGY", { kind: "assistant" });
    await addOfficial("wf-4", "EGY", { kind: "assistant" });
    await addOfficial("wf-new", "EGY", { kind: "assistant" });
    await addUser("wf-r@aris.test", "referee", { officialId: "wf-r" });
    const wf = await login("wf-r@aris.test");

    const { id } = await domestic();
    // not ready: empty slots
    expect((await api("POST", `/api/v1/fixtures/${id}/submit`, { session: commission })).status).toBe(409);

    for (const [role, official] of [["R", "wf-r"], ["AR1", "wf-a1"], ["AR2", "wf-a2"], ["FOURTH", "wf-4"]]) {
      expect((await put(commission, id, role, { officialId: official })).status).toBe(200);
    }
    const submitted = await api("POST", `/api/v1/fixtures/${id}/submit`, { session: commission });
    expect(submitted.json.fixture.designationStatus).toBe("awaiting_confirmation");

    // cannot validate until everyone has confirmed
    expect((await api("POST", `/api/v1/fixtures/${id}/validate`, { session: commission })).status).toBe(409);

    // the referee answers their own slot — and only their own
    expect((await api("POST", `/api/v1/fixtures/${id}/designations/AR1/respond`, { session: wf, body: { response: "accept" } })).status).toBe(403);
    expect((await api("POST", `/api/v1/fixtures/${id}/designations/R/respond`, { session: wf, body: { response: "accept" } })).status).toBe(200);
    expect((await api("POST", `/api/v1/fixtures/${id}/designations/confirm-all`, { session: commission })).json.confirmed).toBe(3);

    const validated = await api("POST", `/api/v1/fixtures/${id}/validate`, { session: commission });
    expect(validated.json.fixture.designationStatus).toBe("validated");
    expect((await api("POST", `/api/v1/fixtures/${id}/publish`, { session: commission })).json.fixture.designationStatus).toBe("published");

    // a published crew cannot be changed without a motif…
    const noReason = await put(commission, id, "FOURTH", { officialId: "wf-new" });
    expect(noReason.status).toBe(422);
    // …and once changed, it is no longer validated or published
    const swapped = await put(commission, id, "FOURTH", { officialId: "wf-new", reason: "Fourth official injured" });
    expect(swapped.json.fixture.designationStatus).toBe("awaiting_confirmation");

    const hist = (await api("GET", `/api/v1/fixtures/${id}/history`, { session: commission })).json.history;
    expect(hist[0]).toMatchObject({ action: "replace", reason: "Fourth official injured", fromOfficialId: "wf-4", toOfficialId: "wf-new" });
  });

  it("makes a decline need a reason, tells the commission, and does not offer the slot back", async () => {
    await addCountry("ZZA", "UNAF");
    await addCompetition("zza-d1", "ZZA");
    for (const [id, kind] of [["zza-r1", "referee"], ["zza-r2", "referee"], ["zza-a1", "assistant"], ["zza-a2", "assistant"], ["zza-a3", "assistant"]] as const) {
      await addOfficial(id, "ZZA", { kind });
    }
    await addUser("zza-r1@aris.test", "referee", { officialId: "zza-r1" });
    const r1 = await login("zza-r1@aris.test");
    const fx = uid("fx");
    await addFixture(fx, { country: "ZZA", competition: "zza-d1", date: nextDate(), roles: ["R"] });
    await put(commission, fx, "R", { officialId: "zza-r1" });

    const noReason = await api("POST", `/api/v1/fixtures/${fx}/designations/R/respond`, { session: r1, body: { response: "decline" } });
    expect(noReason.status).toBe(422);
    const declined = await api("POST", `/api/v1/fixtures/${fx}/designations/R/respond`, { session: r1, body: { response: "decline", reason: "Family emergency" } });
    expect(declined.json.fixture.crew[0]).toMatchObject({ officialId: "zza-r1", state: "declined" });

    const alerts = await api("GET", "/api/v1/notifications", { session: commission });
    expect(JSON.stringify(alerts.json)).toContain("Family emergency");

    const filled = await api("POST", "/api/v1/fixtures/autofill", { session: commission, body: { fixtureIds: [fx] } });
    expect(filled.json.assignments[0].officialId).toBe("zza-r2");
  });
});

describe("auto-fill", () => {
  it("fills what the engine can, tells the officials, and can be undone as one run", async () => {
    await addCountry("ZZB", "UNAF");
    await addCompetition("zzb-d1", "ZZB");
    for (const [id, kind] of [["zzb-r1", "referee"], ["zzb-r2", "referee"], ["zzb-a1", "assistant"], ["zzb-a2", "assistant"]] as const) {
      await addOfficial(id, "ZZB", { kind });
    }
    const fx = uid("fx");
    const date = nextDate();
    await addFixture(fx, { country: "ZZB", competition: "zzb-d1", date, roles: ["R", "AR1", "AR2", "FOURTH"] });

    const run = await api("POST", "/api/v1/fixtures/autofill", { session: commission, body: { fixtureIds: [fx] } });
    expect(run.status).toBe(200);
    // ZZB has two assistants for three assistant roles: the third slot is covered from outside the home list
    expect(run.json.filled).toBe(4);
    const crew = (await api("GET", `/api/v1/fixtures/${fx}`, { session: commission })).json.fixture.crew;
    const ids = crew.map((s: { officialId: string | null }) => s.officialId).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length); // nobody twice
    expect(ids.filter((i: string) => i.startsWith("zzb-"))).toHaveLength(3); // R + the two home assistants

    const hist = (await api("GET", `/api/v1/fixtures/${fx}/history`, { session: commission })).json.history;
    expect(hist.filter((h: { actorKind: string }) => h.actorKind === "engine")).toHaveLength(4);
    expect(JSON.parse(hist[0].engineReason)).toHaveProperty("rating");

    const undo = await api("POST", "/api/v1/fixtures/autofill/undo", { session: commission, body: { runId: run.json.runId } });
    expect(undo.json.reverted).toBe(4);
    const after = (await api("GET", `/api/v1/fixtures/${fx}`, { session: commission })).json.fixture.crew;
    expect(after.every((s: { state: string }) => s.state === "empty")).toBe(true);
  });

  it("does not undo a slot a person has changed since", async () => {
    await addCountry("ZZC", "UNAF");
    await addCompetition("zzc-d1", "ZZC");
    for (const [id, kind] of [["zzc-r1", "referee"], ["zzc-r2", "referee"]] as const) await addOfficial(id, "ZZC", { kind });
    const fx = uid("fx");
    await addFixture(fx, { country: "ZZC", competition: "zzc-d1", date: nextDate(), roles: ["R"] });
    const run = await api("POST", "/api/v1/fixtures/autofill", { session: commission, body: { fixtureIds: [fx] } });
    const picked = run.json.assignments[0].officialId;
    const other = picked === "zzc-r1" ? "zzc-r2" : "zzc-r1";
    await put(commission, fx, "R", { officialId: other, reason: "Preferred by the commission" });
    const undo = await api("POST", "/api/v1/fixtures/autofill/undo", { session: commission, body: { runId: run.json.runId } });
    expect(undo.json).toMatchObject({ reverted: 0, skipped: 1 });
  });
});

describe("the history is evidence", () => {
  it("cannot be edited or deleted, even directly in SQL", async () => {
    const { id } = await domestic();
    await put(commission, id, "R", { officialId: "egy-ref-1" });
    await expect(sql("UPDATE designation_history SET reason = 'x' WHERE fixture_id = ?", id).run()).rejects.toThrow(/append-only/);
    await expect(sql("DELETE FROM audit_log").run()).rejects.toThrow(/append-only/);
  });

  it("admins can read the audit log; commission members cannot", async () => {
    expect((await api("GET", "/api/v1/audit", { session: admin })).status).toBe(200);
    expect((await api("GET", "/api/v1/audit", { session: commission })).status).toBe(403);
  });
});
