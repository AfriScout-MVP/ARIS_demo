import { beforeAll, describe, expect, it } from "vitest";
import { addCompetition, addFederationSeat, addOfficial, login, sql, uid, type Session } from "../helpers";
import { fixture, get, nextDate, post, put, world, type World } from "./support";

let w: World;
let zzb: Session;
beforeAll(async () => {
  w = await world();
  await addCompetition("zzb-d1", "ZZB");
  await addCompetition("zzc-d1", "ZZC");
  zzb = await login((await addFederationSeat("ZZB")).email);
});

describe("auto-fill", () => {
  it("fills what the engine can, tells the officials, and can be undone as one run", async () => {
    for (const [id, kind] of [["zzb-r1", "referee"], ["zzb-r2", "referee"], ["zzb-a1", "assistant"], ["zzb-a2", "assistant"]] as const) {
      await addOfficial(id, "ZZB", { kind });
    }
    await addOfficial("egy-cover-a", "EGY", { kind: "assistant" }); // lends the third assistant
    const fx = uid("fx");
    await fixture(fx, { country: "ZZB", competition: "zzb-d1", date: nextDate(), roles: ["R", "AR1", "AR2", "FOURTH"] });

    const run = await post(zzb, "/fixtures/autofill", { fixtureIds: [fx] });
    expect(run.status).toBe(200);
    // ZZB has two assistants for three assistant roles: the third slot is covered from outside the home list
    expect(run.json.filled).toBe(4);
    const crew = (await get(zzb, `/fixtures/${fx}`)).json.fixture.crew;
    const ids = crew.map((s: { officialId: string | null }) => s.officialId).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length); // nobody twice
    expect(ids.filter((i: string) => i.startsWith("zzb-"))).toHaveLength(3);

    const hist = (await get(zzb, `/fixtures/${fx}/history`)).json.history;
    expect(hist.filter((h: { actorKind: string }) => h.actorKind === "engine")).toHaveLength(4);
    expect(JSON.parse(hist[0].engineReason)).toHaveProperty("rating");

    const undo = await post(zzb, "/fixtures/autofill/undo", { runId: run.json.runId });
    expect(undo.json.reverted).toBe(4);
    const after = (await get(zzb, `/fixtures/${fx}`)).json.fixture.crew;
    expect(after.every((s: { state: string }) => s.state === "empty")).toBe(true);
  });

  it("does not undo a slot a person has changed since", async () => {
    const zzc = await login((await addFederationSeat("ZZC")).email);
    for (const id of ["zzc-r1", "zzc-r2"]) await addOfficial(id, "ZZC");
    const fx = uid("fx");
    await fixture(fx, { country: "ZZC", competition: "zzc-d1", date: nextDate(), roles: ["R"] });
    const run = await post(zzc, "/fixtures/autofill", { fixtureIds: [fx] });
    const picked = run.json.assignments[0].officialId;
    const other = picked === "zzc-r1" ? "zzc-r2" : "zzc-r1";
    await put(zzc, fx, "R", { officialId: other, reason: "Preferred by the federation" });
    const undo = await post(zzc, "/fixtures/autofill/undo", { runId: run.json.runId });
    expect(undo.json).toMatchObject({ reverted: 0, skipped: 1 });
  });

  it("skips cancelled fixtures", async () => {
    await addOfficial("zzb-r3", "ZZB");
    const fx = uid("fx");
    await fixture(fx, { country: "ZZB", competition: "zzb-d1", date: nextDate(), roles: ["R"] });
    await sql("UPDATE fixtures SET status = 'cancelled' WHERE id = ?", fx).run();
    const run = await post(zzb, "/fixtures/autofill", { fixtureIds: [fx] });
    expect(run.json).toMatchObject({ runId: null, filled: 0, skipped: 1 });
  });

  it("validates the request and refuses non-staff", async () => {
    expect((await post(zzb, "/fixtures/autofill", {})).status).toBe(422);
    expect((await post(w.referee, "/fixtures/autofill", { country: "EGY" })).status).toBe(403);
    expect((await post(null, "/fixtures/autofill", { country: "EGY" })).status).toBe(401);
  });

  it("never touches another country's fixtures", async () => {
    const fx = uid("fx");
    await fixture(fx, { country: "EGY", competition: "egy-d1", date: nextDate(), roles: ["R"] });
    // a ZZB seat asking for an EGY fixture by id: 404, nothing written
    expect((await post(zzb, "/fixtures/autofill", { fixtureIds: [fx] })).status).toBe(404);
    // by country: nothing filled
    const byCountry = await post(zzb, "/fixtures/autofill", { country: "EGY", from: "2000-01-01" });
    expect(byCountry.json.filled).toBe(0);
    const row = await sql("SELECT official_id FROM designations WHERE fixture_id = ?", fx).first<{ official_id: string | null }>();
    expect(row!.official_id).toBeNull();
    // and cannot undo a foreign run
    const run = await post(w.egy, "/fixtures/autofill", { fixtureIds: [fx] });
    expect((await post(zzb, "/fixtures/autofill/undo", { runId: run.json.runId })).status).toBe(404);
  });
});
