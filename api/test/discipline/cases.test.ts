import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers";
import { get, makeWorld, post, type World } from "../helpers/evaluation";

let w: World;
beforeAll(async () => {
  w = await makeWorld("DCA", "DCB");
});

const open = async (officialId = "DCA-ref1", extra: object = {}) => (await post(w.seatA, "/cases", { officialId, summary: "Two overturned calls on matchday 14", ...extra })).json.case;

describe("disciplinary cases", () => {
  it("opens, hears, decides and closes, telling the official at each step in both languages", async () => {
    const c = await open();
    expect(c).toMatchObject({ status: "opened", officialId: "DCA-ref1", countryCode: "DCA" });
    const hearing = await post(w.seatA, `/cases/${c.id}/hearing`, { hearingAt: "2030-03-01T10:00:00Z" });
    expect(hearing.json.case).toMatchObject({ status: "hearing_scheduled", hearingAt: "2030-03-01T10:00:00Z" });
    const decided = await post(w.seatA, `/cases/${c.id}/decide`, { sanction: "warning", decision: "Formal warning issued" });
    expect(decided.json.case).toMatchObject({ status: "decided", sanction: "warning" });
    expect((await post(w.seatA, `/cases/${c.id}/hearing`, { hearingAt: "2030-04-01" })).status).toBe(409);
    expect((await post(w.seatA, `/cases/${c.id}/decide`, { sanction: "none", decision: "Decide again" })).status).toBe(409);
    expect((await post(w.seatA, `/cases/${c.id}/close`, { note: "Done" })).json.case.status).toBe("closed");
    const titles = (await get(w.refA1, "/notifications")).json.notifications.map((n: { title: { fr: string; en: string } }) => n.title);
    expect(titles).toContainEqual({ fr: "Audition programmée", en: "Hearing scheduled" });
    expect(titles).toContainEqual({ fr: "Décision disciplinaire", en: "Disciplinary decision" });
  });

  it("moves the linked incident to 'reviewing' and refuses an incident of someone else", async () => {
    const inc = (await post(w.seatA, "/incidents", { kind: "incident", officialId: "DCA-ref1", description: "Misconduct after the match" })).json.incident;
    await open("DCA-ref1", { incidentId: inc.id });
    expect((await sql("SELECT status FROM incidents WHERE id = ?", inc.id).first<{ status: string }>())!.status).toBe("reviewing");
    expect((await post(w.seatA, "/cases", { officialId: "DCA-ref2", incidentId: inc.id, summary: "Wrong official" })).json.error.code).toBe("unknown_reference");
  });

  it("lets an official appeal only their own decided case", async () => {
    const c = await open("DCA-ref2");
    expect((await post(w.refA2, `/cases/${c.id}/appeal`, { note: "Too early to appeal" })).json.error.code).toBe("bad_state");
    await post(w.seatA, `/cases/${c.id}/decide`, { sanction: "warning", decision: "Formal warning issued" });
    expect((await post(w.refA1, `/cases/${c.id}/appeal`, { note: "Not my case but I object" })).status).toBe(404);
    expect((await post(w.refA2, `/cases/${c.id}/appeal`, { note: "x" })).status).toBe(422);
    expect((await post(w.refA2, `/cases/${c.id}/appeal`, { note: "I was delayed by a road closure" })).json.case.status).toBe("appealed");
    const appeal = (await get(w.seatA, "/notifications")).json.notifications.find((n: { title: { en: string } }) => n.title.en === "Appeal filed");
    expect(appeal.title.fr).toBe("Recours déposé");
    expect((await get(w.seatB, "/notifications")).json.notifications.some((n: { title: { en: string } }) => n.title.en === "Appeal filed")).toBe(false);
  });

  it("shows a referee only their own cases", async () => {
    await open("DCA-ref1");
    expect((await get(w.refA1, "/cases")).json.cases.every((c: { officialId: string }) => c.officialId === "DCA-ref1")).toBe(true);
    expect((await get(w.obsA, "/cases")).json.cases).toHaveLength(0);
  });

  it("validates the body", async () => {
    const c = await open();
    expect((await post(w.seatA, "/cases", { officialId: "DCA-ref1", summary: "no" })).status).toBe(422);
    expect((await post(w.seatA, `/cases/${c.id}/hearing`, { hearingAt: "not a date at all" })).status).toBe(422);
    expect((await post(w.seatA, `/cases/${c.id}/decide`, { sanction: "banishment", decision: "Banished from football" })).status).toBe(422);
    expect((await post(w.seatA, `/cases/${c.id}/close`, {})).status).toBe(422);
  });

  it("answers 401 and 403", async () => {
    const c = await open();
    expect((await post(null, "/cases", { officialId: "DCA-ref1", summary: "Anonymous case" })).status).toBe(401);
    expect((await get(null, "/cases")).status).toBe(401);
    expect((await post(w.refA1, "/cases", { officialId: "DCA-ref1", summary: "Opening my own case" })).status).toBe(403);
    for (const path of ["hearing", "decide", "close"]) expect((await post(w.refA1, `/cases/${c.id}/${path}`, { hearingAt: "2030-01-01", sanction: "none", decision: "Self pardon", note: "close" })).status).toBe(403);
  });
});
