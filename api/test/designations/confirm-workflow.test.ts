import { beforeAll, describe, expect, it } from "vitest";
import { addCompetition, addCountry, addFederationSeat, addOfficial, addUser, login, sql, uid, type Session } from "../helpers";
import { fixture, get, nextDate, post, put, world, type World } from "./support";
import { api } from "../helpers";

let w: World;
let wf: Session;
beforeAll(async () => {
  w = await world();
  for (const [id, kind] of [["wf-r", "referee"], ["wf-a1", "assistant"], ["wf-a2", "assistant"], ["wf-4", "assistant"], ["wf-new", "assistant"]] as const) {
    await addOfficial(id, "EGY", { kind });
  }
  await addUser("wf-r@aris.test", "referee", { officialId: "wf-r" });
  wf = await login("wf-r@aris.test");
});

async function crewed() {
  const id = uid("fx");
  await fixture(id, { country: "EGY", competition: "egy-d1", date: nextDate() });
  for (const [role, official] of [["R", "wf-r"], ["AR1", "wf-a1"], ["AR2", "wf-a2"], ["FOURTH", "wf-4"]]) {
    expect((await put(w.egy, id, role, { officialId: official })).status).toBe(200);
  }
  return id;
}

describe("the designation workflow", () => {
  it("runs draft → awaiting confirmation → validated → published, and demands a reason to change it", async () => {
    const id = await uid("fx");
    await fixture(id, { country: "EGY", competition: "egy-d1", date: nextDate() });
    // not ready: empty slots
    expect((await post(w.egy, `/fixtures/${id}/submit`)).status).toBe(409);
    for (const [role, official] of [["R", "wf-r"], ["AR1", "wf-a1"], ["AR2", "wf-a2"], ["FOURTH", "wf-4"]]) await put(w.egy, id, role, { officialId: official });

    const submitted = await post(w.egy, `/fixtures/${id}/submit`);
    expect(submitted.json.fixture.designationStatus).toBe("awaiting_confirmation");
    // cannot validate until everyone has confirmed
    expect((await post(w.egy, `/fixtures/${id}/validate`)).status).toBe(409);

    // the referee answers their own slot — and only their own
    expect((await post(wf, `/fixtures/${id}/designations/AR1/respond`, { response: "accept" })).status).toBe(403);
    expect((await post(wf, `/fixtures/${id}/designations/R/respond`, { response: "accept" })).status).toBe(200);
    expect((await post(w.egy, `/fixtures/${id}/designations/confirm-all`)).json.confirmed).toBe(3);

    expect((await post(w.egy, `/fixtures/${id}/validate`)).json.fixture.designationStatus).toBe("validated");
    expect((await post(w.egy, `/fixtures/${id}/publish`)).json.fixture.designationStatus).toBe("published");

    // a published crew cannot be changed without a motif…
    expect((await put(w.egy, id, "FOURTH", { officialId: "wf-new" })).status).toBe(422);
    // …and once changed, it is no longer validated or published
    const swapped = await put(w.egy, id, "FOURTH", { officialId: "wf-new", reason: "Fourth official injured" });
    expect(swapped.json.fixture.designationStatus).toBe("awaiting_confirmation");

    const hist = (await get(w.egy, `/fixtures/${id}/history`)).json.history;
    expect(hist[0]).toMatchObject({ action: "replace", reason: "Fourth official injured", fromOfficialId: "wf-4", toOfficialId: "wf-new" });
  });

  it("notifies the designated official, and the convocation on publication", async () => {
    const id = await crewed();
    await post(w.egy, `/fixtures/${id}/designations/confirm-all`);
    await post(w.egy, `/fixtures/${id}/submit`);
    await post(w.egy, `/fixtures/${id}/validate`);
    await post(w.egy, `/fixtures/${id}/publish`);
    const n = await sql("SELECT COUNT(*) AS n FROM notifications WHERE dedupe_key LIKE ?", `convocation:${id}:%`).first<{ n: number }>();
    expect(n!.n).toBe(1); // only wf-r has an account to notify
    const conv = await get(w.egy, `/fixtures/${id}/convocations`);
    expect(conv.json.convocations).toHaveLength(4);
  });

  it("makes a decline need a reason, tells the federation of that country only, and does not offer the slot back", async () => {
    await addCountry("ZZA");
    await addCompetition("zza-d1", "ZZA");
    const zza = await addFederationSeat("ZZA");
    const zzaS = await login(zza.email);
    for (const [id, kind] of [["zza-r1", "referee"], ["zza-r2", "referee"], ["zza-a1", "assistant"], ["zza-a2", "assistant"], ["zza-a3", "assistant"]] as const) {
      await addOfficial(id, "ZZA", { kind });
    }
    await addUser("zza-r1@aris.test", "referee", { officialId: "zza-r1" });
    const r1 = await login("zza-r1@aris.test");
    const fx = uid("fx");
    await fixture(fx, { country: "ZZA", competition: "zza-d1", date: nextDate(), roles: ["R"] });
    await put(zzaS, fx, "R", { officialId: "zza-r1" });

    expect((await post(r1, `/fixtures/${fx}/designations/R/respond`, { response: "decline" })).status).toBe(422);
    const declined = await post(r1, `/fixtures/${fx}/designations/R/respond`, { response: "decline", reason: "Family emergency" });
    expect(declined.json.fixture.crew[0]).toMatchObject({ officialId: "zza-r1", state: "declined" });

    const notice = await sql("SELECT audience_role, country_code FROM notifications WHERE detail LIKE '%Family emergency%'").first<{ audience_role: string; country_code: string }>();
    expect(notice).toEqual({ audience_role: "federation", country_code: "ZZA" });

    const filled = await post(zzaS, "/fixtures/autofill", { fixtureIds: [fx] });
    expect(filled.json.assignments[0].officialId).toBe("zza-r2");
  });

  it("sends the decline of a continental tie to the admins", async () => {
    await addOfficial("cl-ref", "NGA");
    await addUser("cl-ref@aris.test", "referee", { officialId: "cl-ref" });
    const cl = await login("cl-ref@aris.test");
    const id = uid("fx");
    const { addFixture } = await import("../helpers");
    await addFixture(id, { country: "CAF", competition: "caf-cl", date: nextDate(), home: "Al Ahly", away: "Wydad AC", homeCode: "EGY", awayCode: "MAR", roles: ["R"] });
    await put(w.admin, id, "R", { officialId: "cl-ref" });
    await post(cl, `/fixtures/${id}/designations/R/respond`, { response: "decline", reason: "Visa refused" });
    const notice = await sql("SELECT audience_role, country_code FROM notifications WHERE detail LIKE '%Visa refused%'").first<{ audience_role: string; country_code: string | null }>();
    expect(notice).toEqual({ audience_role: "admin", country_code: null });
  });

  it("hides a fixture from a referee who is not designated on it", async () => {
    const id = uid("fx");
    await fixture(id, { country: "EGY", competition: "egy-d1", date: nextDate(), roles: ["R"] });
    await put(w.egy, id, "R", { officialId: "wf-r" });
    expect((await post(w.referee, `/fixtures/${id}/designations/R/respond`, { response: "accept" })).status).toBe(404);
    expect((await get(w.referee, `/fixtures/${id}`)).status).toBe(404);
    expect((await get(wf, `/fixtures/${id}`)).status).toBe(200);
  });

  it("requires a session and a staff role for the pipeline steps", async () => {
    const id = await crewed();
    expect((await api("POST", `/api/v1/fixtures/${id}/submit`)).status).toBe(401);
    expect((await post(wf, `/fixtures/${id}/submit`)).status).toBe(403);
    expect((await post(w.mar, `/fixtures/${id}/submit`)).status).toBe(404);
    expect((await post(w.mar, `/fixtures/${id}/designations/confirm-all`)).status).toBe(404);
  });
});
