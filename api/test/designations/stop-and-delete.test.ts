import { beforeAll, describe, expect, it } from "vitest";
import { addOfficial, addUser, api, login, sql, uid, type Session } from "../helpers";
import { fixture, get, nextDate, post, put, world, type World } from "./support";

// Postponing, cancelling, taking back to draft and deleting a fixture: state-machine refusals, effects on the crew
// and on money, notifications, and the three-role scope (federation of another country 404, referee 403).

let w: World;
let ref: Session;
beforeAll(async () => {
  w = await world();
  for (const [id, kind] of [["sd-r", "referee"], ["sd-a1", "assistant"], ["sd-a2", "assistant"], ["sd-4", "assistant"]] as const) await addOfficial(id, "EGY", { kind });
  await addUser("sd-r@aris.test", "referee", { officialId: "sd-r" });
  ref = await login("sd-r@aris.test");
});

const del = (s: Session | null, path: string, body?: object) => api("DELETE", `/api/v1${path}`, { session: s, body });
const titles = async (s: Session) => (await get(s, "/notifications")).json.notifications.map((n: { title: { en: string; fr: string } }) => n.title);

async function crewed(publish = false) {
  const id = uid("fx");
  await fixture(id, { country: "EGY", competition: "egy-d1", date: nextDate() });
  for (const [role, official] of [["R", "sd-r"], ["AR1", "sd-a1"], ["AR2", "sd-a2"], ["FOURTH", "sd-4"]]) {
    expect((await put(w.egy, id, role, { officialId: official, state: "confirmed" })).status).toBe(200);
  }
  if (publish) {
    await post(w.egy, `/fixtures/${id}/submit`);
    await post(w.egy, `/fixtures/${id}/validate`);
    expect((await post(w.egy, `/fixtures/${id}/publish`)).json.fixture.designationStatus).toBe("published");
  }
  return id;
}

describe("postpone and cancel", () => {
  it("postpones with a reason, keeps the crew, tells it, and refuses to postpone twice from another state", async () => {
    const id = await crewed();
    expect((await post(w.egy, `/fixtures/${id}/postpone`, {})).status).toBe(422);
    const res = await post(w.egy, `/fixtures/${id}/postpone`, { reason: "Waterlogged pitch" });
    expect(res.status).toBe(200);
    expect(res.json.fixture.status).toBe("postponed");
    expect(res.json.fixture.crew.filter((s: { officialId: string | null }) => s.officialId)).toHaveLength(4);
    expect(await titles(ref)).toContainEqual({ en: "Match postponed", fr: "Rencontre reportée" });
    expect((await post(w.egy, `/fixtures/${id}/postpone`, { reason: "Again" })).json.changed).toBe(false);
    const audit = await sql("SELECT reason, country_code FROM audit_log WHERE action = 'fixture.postponed' AND entity_id = ?", id).first<{ reason: string; country_code: string }>();
    expect(audit).toEqual({ reason: "Waterlogged pitch", country_code: "EGY" });
    // a postponed match can still be cancelled; nobody designates on it meanwhile
    expect((await put(w.egy, id, "FOURTH", { officialId: "sd-a1" })).json.error.code).toBe("fixture_not_scheduled");
  });

  it("cancels: releases the whole crew, cancels unpaid lines, keeps a matches row in step, and is final", async () => {
    const id = await crewed();
    await sql("INSERT INTO payments (id, fixture_id, role, official_id, base) VALUES (?, ?, 'R', 'sd-r', 1000)", `pay-${id}`, id).run();
    const { home, away, at } = (await sql("SELECT home_team_id AS home, away_team_id AS away, kickoff_at AS at FROM fixtures WHERE id = ?", id).first<{ home: string; away: string; at: string }>())!;
    await sql("INSERT INTO matches (id, home_team_id, away_team_id, match_date, status, fixture_id) VALUES (?, ?, ?, ?, 'scheduled', ?)", `m-${id}`, home, away, at, id).run();

    const res = await post(w.egy, `/fixtures/${id}/cancel`, { reason: "Security advice from the police" });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ changed: true, released: 4 });
    expect(res.json.fixture.status).toBe("cancelled");
    expect(res.json.fixture.crew.every((s: { state: string }) => s.state === "empty")).toBe(true);
    expect((await sql("SELECT status FROM payments WHERE id = ?", `pay-${id}`).first<{ status: string }>())!.status).toBe("cancelled");
    expect((await sql("SELECT status FROM matches WHERE id = ?", `m-${id}`).first<{ status: string }>())!.status).toBe("cancelled");
    const cleared = await sql("SELECT COUNT(*) AS n FROM designation_history WHERE fixture_id = ? AND action = 'clear'", id).first<{ n: number }>();
    expect(cleared!.n).toBe(4);
    expect(await titles(ref)).toContainEqual({ en: "Match cancelled", fr: "Rencontre annulée" });

    // final: no postponing, no money generated, no second cancellation effect
    expect((await post(w.egy, `/fixtures/${id}/postpone`, { reason: "Changed our mind" })).json.error.code).toBe("fixture_not_scheduled");
    expect((await post(w.egy, `/fixtures/${id}/cancel`, { reason: "Again" })).json.changed).toBe(false);
    expect((await post(w.egy, "/payments/generate", { fixtureId: id })).json.error.code).toBe("fixture_cancelled");
  });

  it("refuses a played match", async () => {
    const id = await crewed();
    await sql("UPDATE fixtures SET status = 'played' WHERE id = ?", id).run();
    expect((await post(w.egy, `/fixtures/${id}/cancel`, { reason: "Too late" })).json.error.code).toBe("match_played");
    expect((await post(w.egy, `/fixtures/${id}/postpone`, { reason: "Too late" })).json.error.code).toBe("match_played");
  });

  it("is 404 across borders and 403 to a referee, with nothing changed", async () => {
    const id = await crewed();
    for (const path of ["postpone", "cancel", "unpublish"]) {
      expect((await post(w.mar, `/fixtures/${id}/${path}`, { reason: "Not mine" })).status).toBe(404);
      expect((await post(ref, `/fixtures/${id}/${path}`, { reason: "My own match" })).status).toBe(403);
      expect((await post(null, `/fixtures/${id}/${path}`, { reason: "Anonymous" })).status).toBe(401);
    }
    expect((await sql("SELECT status FROM fixtures WHERE id = ?", id).first<{ status: string }>())!.status).toBe("scheduled");
  });
});

describe("unpublish", () => {
  it("takes a published crew back to draft with a reason and tells the crew", async () => {
    const id = await crewed(true);
    expect((await post(w.egy, `/fixtures/${id}/unpublish`, { reason: "x" })).status).toBe(422);
    const res = await post(w.egy, `/fixtures/${id}/unpublish`, { reason: "Wrong venue on the convocation" });
    expect(res.json.fixture.designationStatus).toBe("draft");
    expect(res.json.fixture.crew.filter((s: { state: string }) => s.state === "confirmed")).toHaveLength(4);
    expect(await titles(ref)).toContainEqual({ en: "Convocation withdrawn", fr: "Convocation retirée" });
    expect((await post(w.egy, `/fixtures/${id}/unpublish`, { reason: "Again please" })).json.changed).toBe(false);
    const row = await sql("SELECT published_at, validated_at FROM fixtures WHERE id = ?", id).first();
    expect(row).toEqual({ published_at: null, validated_at: null });
  });
});

describe("DELETE /fixtures/:id", () => {
  it("deletes a draft with its slots, keeps the designation history, tells the crew and audits it", async () => {
    const id = await crewed();
    const res = await del(w.egy, `/fixtures/${id}`, { reason: "Entered twice" });
    expect(res.status).toBe(200);
    expect(await sql("SELECT 1 FROM fixtures WHERE id = ?", id).first()).toBeNull();
    expect((await sql("SELECT COUNT(*) AS n FROM designations WHERE fixture_id = ?", id).first<{ n: number }>())!.n).toBe(0);
    expect((await sql("SELECT COUNT(*) AS n FROM designation_history WHERE fixture_id = ?", id).first<{ n: number }>())!.n).toBeGreaterThan(0);
    const audit = await sql("SELECT reason, before FROM audit_log WHERE action = 'fixture.delete' AND entity_id = ?", id).first<{ reason: string; before: string }>();
    expect(audit!.reason).toBe("Entered twice");
    expect(JSON.parse(audit!.before).id).toBe(id);
    expect((await get(w.egy, `/fixtures/${id}`)).status).toBe(404);
  });

  it("refuses a published crew (409) until it is back to draft, and anything with money or a result", async () => {
    const id = await crewed(true);
    expect((await del(w.egy, `/fixtures/${id}`)).json.error.code).toBe("published");
    await post(w.egy, `/fixtures/${id}/unpublish`, { reason: "Removing this fixture" });
    expect((await del(w.egy, `/fixtures/${id}`)).status).toBe(200);

    const paid = await crewed();
    await sql("INSERT INTO payments (id, fixture_id, role, official_id, base) VALUES (?, ?, 'R', 'sd-r', 1000)", `pay-${paid}`, paid).run();
    const r = await del(w.egy, `/fixtures/${paid}`);
    expect(r.status).toBe(409);
    expect(r.json.error).toMatchObject({ code: "in_use", details: { payments: 1, advances: 0 } });

    const played = await crewed();
    await sql("UPDATE fixtures SET status = 'played' WHERE id = ?", played).run();
    expect((await del(w.egy, `/fixtures/${played}`)).json.error.code).toBe("match_played");
  });

  it("validated but never published can still be deleted", async () => {
    const id = await crewed();
    await post(w.egy, `/fixtures/${id}/submit`);
    expect((await post(w.egy, `/fixtures/${id}/validate`)).json.fixture.designationStatus).toBe("validated");
    expect((await del(w.egy, `/fixtures/${id}`)).status).toBe(200);
  });

  it("is 404 across borders (also for continental ties), 403 to a referee, 401 signed out", async () => {
    const id = await crewed();
    const caf = uid("fx");
    await fixture(caf, { country: "CAF", competition: "caf-cl", date: nextDate(), homeCode: "EGY", awayCode: "MAR" });
    expect((await del(w.mar, `/fixtures/${id}`)).status).toBe(404);
    expect((await del(w.egy, `/fixtures/${caf}`)).status).toBe(404);
    expect((await del(ref, `/fixtures/${id}`)).status).toBe(403);
    expect((await del(null, `/fixtures/${id}`)).status).toBe(401);
    expect(await sql("SELECT 1 AS x FROM fixtures WHERE id = ?", id).first()).toEqual({ x: 1 });
    expect((await del(w.admin, `/fixtures/${caf}`)).status).toBe(200);
  });
});
