import { beforeAll, describe, expect, it } from "vitest";
import { addOfficial, sql, uid } from "../helpers";
import { fixture, nextDate, patch, post, world, type World } from "./support";

let w: World;
beforeAll(async () => {
  w = await world();
  await addOfficial("rc-r", "EGY");
});

// one past day per match: the default teams may not meet twice on the same day
let n = 0;
async function played() {
  const id = uid("fx");
  await fixture(id, { country: "EGY", competition: "egy-d1", date: `2024-03-${String(++n).padStart(2, "0")}` });

  await sql("UPDATE designations SET official_id = 'rc-r', state = 'confirmed' WHERE fixture_id = ? AND role = 'R'", id).run();
  const res = await post(w.egy, `/fixtures/${id}/result`, { score: "2-1", attendance: 12000 });
  expect(res.status).toBe(201);
  return { id, matchId: res.json.matchId as string };
}

describe("PATCH /fixtures/:id/result — correcting a recorded result", () => {
  it("changes the score, keeps the previous value in the audit row with the reason", async () => {
    const { id, matchId } = await played();
    const res = await patch(w.egy, `/fixtures/${id}/result`, { score: "1-1", reason: "Typing error on the match sheet" });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ matchId, changed: true, result: { homeScore: 1, awayScore: 1, attendance: 12000 } });
    expect(await sql("SELECT home_score AS h, away_score AS a FROM matches WHERE id = ?", matchId).first()).toEqual({ h: 1, a: 1 });
    const audit = await sql("SELECT before, after, reason, country_code AS cc FROM audit_log WHERE action = 'fixture.result_correct' AND entity_id = ?", id).first<{ before: string; after: string; reason: string; cc: string }>();
    expect(JSON.parse(audit!.before)).toMatchObject({ homeScore: 2, awayScore: 1 });
    expect(JSON.parse(audit!.after)).toMatchObject({ homeScore: 1, awayScore: 1 });
    expect(audit!.reason).toBe("Typing error on the match sheet");
    expect(audit!.cc).toBe("EGY");
    // the same value again changes nothing and writes nothing
    expect((await patch(w.egy, `/fixtures/${id}/result`, { homeScore: 1, awayScore: 1, reason: "Same again" })).json.changed).toBe(false);
  });

  it("requires a reason and a score, and a played match", async () => {
    const { id } = await played();
    expect((await patch(w.egy, `/fixtures/${id}/result`, { score: "3-0" })).status).toBe(422);
    expect((await patch(w.egy, `/fixtures/${id}/result`, { reason: "No score given" })).status).toBe(422);
    const open = uid("fx");
    await fixture(open, { country: "EGY", competition: "egy-d1", date: nextDate() });
    expect((await patch(w.egy, `/fixtures/${open}/result`, { score: "3-0", reason: "Not played yet" })).json.error.code).toBe("not_played");
  });

  it("is the admin's and the owning federation's only", async () => {
    const { id, matchId } = await played();
    expect((await patch(w.mar, `/fixtures/${id}/result`, { score: "0-3", reason: "Foreign correction" })).status).toBe(404);
    expect((await patch(w.referee, `/fixtures/${id}/result`, { score: "0-3", reason: "Referee correction" })).status).toBe(403);
    expect((await patch(null, `/fixtures/${id}/result`, { score: "0-3", reason: "Anonymous correction" })).status).toBe(401);
    expect(await sql("SELECT home_score AS h FROM matches WHERE id = ?", matchId).first()).toEqual({ h: 2 });
    expect((await patch(w.admin, `/fixtures/${id}/result`, { score: "0-3", reason: "Forfeit decided by the CAF" })).json.result).toMatchObject({ homeScore: 0, awayScore: 3 });
  });
});
