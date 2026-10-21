import { beforeAll, describe, expect, it } from "vitest";
import { addFixture, sql } from "../helpers";
import { addPlayedMatch, get, makeWorld, patch, post, type World } from "../helpers/evaluation";

let w: World;
beforeAll(async () => {
  w = await makeWorld("DIA", "DIB");
});

const report = (s: Parameters<typeof post>[0], extra: object = {}) =>
  post(s, "/incidents", { kind: "incident", officialId: "DIA-ref1", severity: "major", description: "Alleged misconduct after the match", ...extra });

describe("incidents", () => {
  it("never suspends on a report alone", async () => {
    const res = await report(w.seatA, { severity: "critical" });
    expect(res.status).toBe(201);
    expect(res.json.incident).toMatchObject({ kind: "incident", officialId: "DIA-ref1", status: "open" });
    expect((await sql("SELECT status FROM officials WHERE id = 'DIA-ref1'").first<{ status: string }>())!.status).toBe("active");
  });

  it("lets a referee declare their own absence or delay, but only their own and nothing worse", async () => {
    expect((await post(w.refA1, "/incidents", { kind: "absence", description: "Sick on matchday, certificate to follow" })).status).toBe(201);
    const other = await post(w.refA1, "/incidents", { kind: "lateness", officialId: "DIA-ref2", description: "Reporting someone else" });
    expect(other.json.incident.officialId).toBe("DIA-ref1"); // officialId is ignored for a referee
    expect((await post(w.refA1, "/incidents", { kind: "incident", description: "A serious incident report" })).status).toBe(403);
    expect((await post(w.refA1, "/incidents", { kind: "refusal", description: "Refusing the appointment" })).status).toBe(403);
    expect((await get(w.refA2, "/incidents")).json.incidents).toHaveLength(0);
    expect((await get(w.refA1, "/incidents")).json.incidents.every((i: { officialId: string }) => i.officialId === "DIA-ref1")).toBe(true);
  });

  it("alerts the official's federation in both languages, and no other federation", async () => {
    await report(w.seatA, { description: "Unique marker for the alert test" });
    const mine = (await get(w.seatA, "/notifications")).json.notifications.find((n: { detail: { en: string } }) => n.detail.en.includes("Unique marker"));
    expect(mine.title).toEqual({ fr: "Incident signalé", en: "Incident reported" });
    const theirs = (await get(w.seatB, "/notifications")).json.notifications;
    expect(theirs.some((n: { detail: { en: string } }) => n.detail.en.includes("Unique marker"))).toBe(false);
    expect((await sql("SELECT country_code FROM audit_log WHERE action = 'incident.report' ORDER BY id DESC LIMIT 1").first<{ country_code: string }>())!.country_code).toBe("DIA");
  });

  it("validates the body", async () => {
    expect((await report(w.seatA, { description: "no" })).status).toBe(422);
    expect((await report(w.seatA, { kind: "fight" })).status).toBe(422);
    expect((await report(w.seatA, { severity: "apocalyptic" })).status).toBe(422);
    expect((await report(w.seatA, { officialId: undefined })).json.error.code).toBe("official_required");
  });

  it("links a fixture only when it concerns the official", async () => {
    const own = await addPlayedMatch({ country: "DIA", competition: "DIA-d1", referee: "DIA-ref1" });
    expect((await report(w.seatA, { fixtureId: own.fixtureId })).status).toBe(201);
    const foreign = await addPlayedMatch({ country: "DIB", competition: "DIB-d1", referee: "DIB-ref1" });
    expect((await report(w.seatA, { fixtureId: foreign.fixtureId })).json.error.code).toBe("unknown_reference");
    expect((await report(w.seatA, { fixtureId: "nope" })).json.error.code).toBe("unknown_reference");
  });

  it("is reviewed and closed by staff", async () => {
    const id = (await report(w.seatA)).json.incident.id;
    expect((await patch(w.seatA, `/incidents/${id}`, { status: "closed", justified: true })).status).toBe(200);
    const row = (await get(w.seatA, "/incidents?status=closed")).json.incidents.find((i: { id: string }) => i.id === id);
    expect(row).toMatchObject({ status: "closed", justified: 1 });
    expect(row.closedAt).toBeTruthy();
    expect((await patch(w.seatA, `/incidents/${id}`, { status: "closed", severity: "nope" })).status).toBe(422);
  });

  it("answers 401, 403 and 404", async () => {
    const id = (await report(w.seatA)).json.incident.id;
    expect((await report(null)).status).toBe(401);
    expect((await get(null, "/incidents")).status).toBe(401);
    expect((await patch(w.refA1, `/incidents/${id}`, { status: "closed" })).status).toBe(403);
    expect((await patch(w.seatA, "/incidents/nope", { status: "closed" })).status).toBe(404);
  });
});
