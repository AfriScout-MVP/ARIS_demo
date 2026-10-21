import { beforeAll, describe, expect, it } from "vitest";
import { addOfficial, addTeam, sql, uid } from "../helpers";
import { fixture, get, nextDate, put, shift, world, type World } from "./support";

let w: World;
beforeAll(async () => {
  w = await world();
});

async function domestic(opts: { roles?: string[]; country?: string; competition?: string } = {}) {
  const id = uid("fx");
  const date = nextDate();
  await fixture(id, { country: opts.country ?? "EGY", competition: opts.competition ?? "egy-d1", date, roles: opts.roles });
  return { id, date };
}

describe("who may designate", () => {
  it("answers 401 without a session and 403 to a referee", async () => {
    const { id } = await domestic();
    expect((await put(null, id, "R", { officialId: "egy-ref-1" })).status).toBe(401);
    expect((await put(w.referee, id, "R", { officialId: "egy-ref-1" })).status).toBe(403);
  });

  it("lets a federation seat designate in its own country", async () => {
    const { id } = await domestic();
    expect((await put(w.egy, id, "R", { officialId: "egy-ref-1" })).status).toBe(200);
  });

  it("answers 404 for another country's fixture, with no side effects", async () => {
    const morocco = uid("fx");
    await fixture(morocco, { country: "MAR", competition: "mar-d1", date: nextDate() });
    const res = await put(w.egy, morocco, "R", { officialId: "egy-ref-1" });
    expect(res.status).toBe(404);
    const row = await sql("SELECT official_id, version FROM designations WHERE fixture_id = ? AND role = 'R'", morocco).first<{ official_id: string | null; version: number }>();
    expect(row).toEqual({ official_id: null, version: 1 });
    const history = await sql("SELECT COUNT(*) AS n FROM designation_history WHERE fixture_id = ?", morocco).first<{ n: number }>();
    expect(history!.n).toBe(0);
  });

  it("keeps continental ties for the admin", async () => {
    await addOfficial("nga-ref-cl0", "NGA");
    const id = uid("fx");
    await fixture(id, { country: "CAF", competition: "caf-cl", date: nextDate(), home: "Al Ahly", away: "Wydad AC", homeCode: "EGY", awayCode: "MAR" });
    expect((await put(w.egy, id, "R", { officialId: "nga-ref-cl0" })).status).toBe(404);
    expect((await put(w.admin, id, "R", { officialId: "nga-ref-cl0" })).status).toBe(200);
  });
});

describe("designation rules", () => {
  it("assigns an eligible official and records who, when and what", async () => {
    const { id } = await domestic();
    const res = await put(w.egy, id, "R", { officialId: "egy-ref-1" });
    expect(res.status).toBe(200);
    const slot = res.json.fixture.crew.find((s: { role: string }) => s.role === "R");
    expect(slot).toMatchObject({ officialId: "egy-ref-1", state: "pending", version: 2 });

    const hist = await get(w.egy, `/fixtures/${id}/history`);
    expect(hist.json.history[0]).toMatchObject({ role: "R", action: "assign", toOfficialId: "egy-ref-1", actorKind: "user" });
  });

  it("validates the body", async () => {
    const { id } = await domestic();
    expect((await put(w.egy, id, "R", {})).status).toBe(422);
    expect((await put(w.egy, id, "NOPE", { officialId: "egy-ref-1" })).status).toBe(422);
    expect((await put(w.egy, id, "R", { officialId: "ghost" })).status).toBe(422);
  });

  it("blocks an official from outside the home list, but lets staff override with a reason", async () => {
    await addOfficial("mar-ref-pool", "MAR");
    const { id } = await domestic();
    const blocked = await put(w.egy, id, "R", { officialId: "mar-ref-pool" });
    expect(blocked.status).toBe(409);
    expect(blocked.json.error.details).toMatchObject({ blockers: ["pool"], overridable: true });
    expect((await put(w.egy, id, "R", { officialId: "mar-ref-pool", override: true })).status).toBe(422);
    const ok = await put(w.egy, id, "R", { officialId: "mar-ref-pool", override: true, reason: "No Egyptian referee free that week" });
    expect(ok.status).toBe(200);
  });

  it("never lets a nation referee its own team in a continental tie", async () => {
    await addOfficial("egy-ref-cl", "EGY");
    await addOfficial("nga-ref-cl", "NGA");
    const id = uid("fx");
    await fixture(id, { country: "CAF", competition: "caf-cl", date: nextDate(), home: "Al Ahly", away: "Wydad AC", homeCode: "EGY", awayCode: "MAR" });
    const res = await put(w.admin, id, "R", { officialId: "egy-ref-cl", override: true, reason: "trying to waive it" });
    expect(res.status).toBe(409);
    expect(res.json.error.details).toMatchObject({ blockers: ["neutrality"], overridable: false });
    expect((await put(w.admin, id, "R", { officialId: "nga-ref-cl" })).status).toBe(200);
  });

  it("applies neutrality to club ties of a continental competition too", async () => {
    await addOfficial("egy-ref-club", "EGY");
    const id = uid("fx");
    await fixture(id, { country: "CAF", competition: "caf-cl", date: nextDate(), roles: ["R"] });
    const home = await addTeam("Club Ahly", "EGY");
    const away = await addTeam("Club Raja", "MAR");
    await sql("UPDATE fixtures SET home_team_id = ?, away_team_id = ? WHERE id = ?", home, away, id).run();
    const dto = await get(w.admin, `/fixtures/${id}`);
    expect(dto.json.fixture).toMatchObject({ homeCode: "EGY", awayCode: "MAR" });
    const res = await put(w.admin, id, "R", { officialId: "egy-ref-club" });
    expect(res.status).toBe(409);
    expect(res.json.error.details.blockers).toContain("neutrality");
  });

  it("refuses a suspended official and an unqualified VAR", async () => {
    await addOfficial("egy-ref-susp", "EGY", { status: "suspended" });
    await addOfficial("egy-ref-novar", "EGY");
    const { id } = await domestic({ roles: ["R", "VAR"] });
    const susp = await put(w.egy, id, "R", { officialId: "egy-ref-susp" });
    expect(susp.json.error.details.blockers).toContain("qualification");
    expect(susp.json.error.details.overridable).toBe(false);
    expect((await put(w.egy, id, "VAR", { officialId: "egy-ref-novar" })).json.error.details.blockers).toContain("qualification");
  });

  it("detects a double booking on the same day", async () => {
    await addOfficial("egy-ref-busy", "EGY");
    const date = nextDate();
    const a = uid("fx");
    const b = uid("fx");
    await fixture(a, { country: "EGY", competition: "egy-d1", date, home: "Alpha FC", away: "Beta FC" });
    await fixture(b, { country: "EGY", competition: "egy-d1", date, home: "Gamma FC", away: "Delta FC" });
    expect((await put(w.egy, a, "R", { officialId: "egy-ref-busy" })).status).toBe(200);
    const second = await put(w.egy, b, "R", { officialId: "egy-ref-busy" });
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
    await fixture(before, { country: "EGY", competition: "egy-d1", date: shift(date, -1) });
    await put(w.egy, before, "R", { officialId: "egy-ref-tired" });
    await sql("INSERT INTO availability (official_id, date, state, reason) VALUES ('egy-ref-away', ?, 'unavailable', 'leave')", date).run();
    await sql("INSERT INTO conflicts_of_interest (id, official_id, kind, subject) VALUES (?, 'egy-ref-fan', 'club', 'Home FC')", uid("coi")).run();

    const target = uid("fx");
    await fixture(target, { country: "EGY", competition: "egy-d1", date });
    expect((await put(w.egy, target, "R", { officialId: "egy-ref-tired" })).json.error.details.blockers).toContain("rest");
    expect((await put(w.egy, target, "R", { officialId: "egy-ref-away" })).json.error.details.blockers).toContain("unavailable");
    expect((await put(w.egy, target, "R", { officialId: "egy-ref-fan" })).json.error.details.blockers).toContain("conflict");
  });

  it("matches a country conflict against the nations of a continental tie", async () => {
    await addOfficial("nga-ref-fan", "NGA");
    await sql("INSERT INTO conflicts_of_interest (id, official_id, kind, subject) VALUES (?, 'nga-ref-fan', 'country', 'MAR')", uid("coi")).run();
    const id = uid("fx");
    await fixture(id, { country: "CAF", competition: "caf-cl", date: nextDate(), home: "Raja", away: "Zamalek", homeCode: "MAR", awayCode: "EGY" });
    expect((await put(w.admin, id, "R", { officialId: "nga-ref-fan" })).json.error.details.blockers).toContain("conflict");
  });

  it("rejects stale writes with the row version", async () => {
    await addOfficial("egy-ref-v1", "EGY");
    await addOfficial("egy-ref-v2", "EGY");
    const { id } = await domestic();
    const first = await put(w.egy, id, "R", { officialId: "egy-ref-v1" });
    const version = first.json.fixture.crew.find((s: { role: string }) => s.role === "R").version;
    const stale = await put(w.egy, id, "R", { officialId: "egy-ref-v2", expectedVersion: version - 1, reason: "swap" });
    expect(stale.status).toBe(409);
    expect(stale.json.error.code).toBe("stale");
  });

  it("refuses to designate on a played or cancelled fixture", async () => {
    const { id } = await domestic();
    await sql("UPDATE fixtures SET status = 'cancelled' WHERE id = ?", id).run();
    const res = await put(w.egy, id, "R", { officialId: "egy-ref-1" });
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("fixture_not_scheduled");
  });
});
