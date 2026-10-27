import { describe, expect, it } from "vitest";
import { sql } from "../helpers";
import { call, create, makePipelineWorld, move, prospectCountry } from "./support";

describe("the partnership pipeline", async () => {
  const w = await makePipelineWorld("PP");
  await prospectCountry("PPB");
  await prospectCountry("PPC");
  await prospectCountry("PPD");

  it("records a prospect owned by its creator, with a first timeline entry and an audit row", async () => {
    const res = await create(w.admin, { country: "ppb", federationCode: "ppbf", contactName: "Awa Diallo", contactEmail: "AWA@ppb.org", officialsEstimate: 320, note: "Met at the CAF congress" });
    expect(res.status).toBe(201);
    expect(res.json.partnership).toMatchObject({
      country: "PPB", federationName: "Fédération test", federationCode: "PPBF", stage: "prospect", priority: "normal",
      contactName: "Awa Diallo", contactEmail: "awa@ppb.org", ownerId: w.admin.user.id, officialsEstimate: 320,
      countryActive: false, federationId: null, events: 2, overdue: false,
    });
    const detail = await call("GET", `/${res.json.partnership.id}`, w.admin);
    expect(detail.json.events.map((e: { kind: string }) => e.kind).sort()).toEqual(["note", "stage"]);
    expect(detail.json.moves).toEqual(["contacted", "negotiating", "on_hold", "declined"]);
    expect((await sql("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'partnership.create' AND country_code = 'PPB'").first<{ n: number }>())!.n).toBe(1);
  });

  it("keeps one open relationship per country, and none with a country that is already a partner", async () => {
    const dup = await create(w.admin, { country: "PPB" });
    expect(dup.status).toBe(409);
    expect(dup.json.error.code).toBe("partnership_exists");
    const partner = await create(w.admin, { country: w.seat.user.country });
    expect(partner.status).toBe(409);
    expect(partner.json.error.code).toBe("already_partner");
    expect((await create(w.admin, { country: "ZZQ" })).json.error.code).toBe("unknown_country");
  });

  it("moves through the open stages, signs, and refuses moves the pipeline does not allow", async () => {
    const { id } = (await create(w.admin, { country: "PPC", priority: "high" })).json.partnership;
    expect((await move(w.admin, id, { stage: "contacted" })).json.partnership.stage).toBe("contacted");
    const skip = await move(w.admin, id, { stage: "agreement_signed", agreementReference: "AGR-1" });
    expect(skip.status).toBe(409);
    expect(skip.json.error).toMatchObject({ code: "bad_transition", details: { allowed: ["prospect", "negotiating", "on_hold", "declined"] } });
    expect((await move(w.admin, id, { stage: "onboarded" })).json.error.code).toBe("use_onboard");
    await move(w.admin, id, { stage: "negotiating" });
    expect((await move(w.admin, id, { stage: "agreement_signed" })).json.error.code).toBe("agreement_required");
    expect((await move(w.admin, id, { stage: "agreement_signed", agreementReference: "AGR-PPC", agreementSignedOn: "2999-01-01" })).json.error.code).toBe("future_date");
    const signed = await move(w.admin, id, { stage: "agreement_signed", agreementReference: "AGR-PPC", agreementSignedOn: "2026-09-01" });
    expect(signed.json.partnership).toMatchObject({ stage: "agreement_signed", agreementReference: "AGR-PPC", agreementSignedOn: "2026-09-01" });
    const timeline = (await call("GET", `/${id}`, w.admin)).json.events.filter((e: { kind: string }) => e.kind === "stage");
    expect(timeline.map((e: { toStage: string }) => e.toStage)).toEqual(expect.arrayContaining(["prospect", "contacted", "negotiating", "agreement_signed"]));
  });

  it("declines with a reason, after which the entry is closed and the country can be approached afresh", async () => {
    const { id } = (await create(w.admin, { country: "PPD", nextStep: "Call back", nextStepDue: "2026-01-01" })).json.partnership;
    expect((await move(w.admin, id, { stage: "declined" })).json.error.code).toBe("reason_required");
    const declined = await move(w.admin, id, { stage: "declined", reason: "Budget not approved this season" });
    expect(declined.json.partnership).toMatchObject({ stage: "declined", declinedReason: "Budget not approved this season", nextStep: null, nextStepDue: null, overdue: false });
    expect((await move(w.admin, id, { stage: "contacted" })).status).toBe(409);
    expect((await call("PATCH", `/${id}`, w.admin, { contactName: "X" })).json.error.code).toBe("partnership_closed");
    expect((await create(w.admin, { country: "PPD" })).status).toBe(201);
  });

  it("edits the details, checks the owner is an active admin, and flags an overdue next step", async () => {
    await prospectCountry("PPE");
    const { id } = (await create(w.admin, { country: "PPE" })).json.partnership;
    const res = await call("PATCH", `/${id}`, w.admin, { ownerId: w.otherAdmin.id, nextStep: "Send the proposal", nextStepDue: "2026-01-02", contactPhone: "+233 20 000 0000", priority: "low" });
    expect(res.status).toBe(200);
    expect(res.json.partnership).toMatchObject({ ownerId: w.otherAdmin.id, nextStep: "Send the proposal", overdue: true, priority: "low", contactPhone: "+233 20 000 0000" });
    expect((await call("PATCH", `/${id}`, w.admin, { ownerId: w.seat.user.id })).json.error.code).toBe("invalid_owner");
    expect((await call("PATCH", `/${id}`, w.admin, {})).status).toBe(422);
    expect((await call("PATCH", `/${id}`, w.admin, { contactEmail: "not-an-email" })).status).toBe(422);
    expect((await call("PATCH", `/${id}`, w.admin, { nextStepDue: "02/01/2026" })).status).toBe(422);
    expect((await call("PATCH", "/nope", w.admin, { contactName: "X" })).status).toBe(404);
  });

  it("logs calls and meetings, and can set the next step in the same go", async () => {
    await prospectCountry("PPF");
    const { id } = (await create(w.admin, { country: "PPF" })).json.partnership;
    const res = await call("POST", `/${id}/events`, w.admin, { kind: "call", body: "Spoke to the secretary general", occurredOn: "2026-10-01", nextStep: "Demo for the referees' committee", nextStepDue: "2999-12-31" });
    expect(res.status).toBe(201);
    expect(res.json.partnership).toMatchObject({ lastContactOn: "2026-10-01", nextStep: "Demo for the referees' committee", nextStepDue: "2999-12-31", overdue: false });
    expect((await call("POST", `/${id}/events`, w.admin, { kind: "call", body: "x", occurredOn: "2999-01-01" })).json.error.code).toBe("future_date");
    expect((await call("POST", `/${id}/events`, w.admin, { kind: "stage", body: "x" })).status).toBe(422);
    expect((await call("POST", `/${id}/events`, w.admin, { kind: "note", body: "" })).status).toBe(422);
    await expect(sql("UPDATE partnership_events SET body = 'rewritten' WHERE partnership_id = ?", id).run()).rejects.toThrow(/append-only/);
  });

  it("lists by stage with counts and the size of each stage, and searches", async () => {
    const all = await call("GET", "", w.admin);
    expect(all.status).toBe(200);
    expect(all.json.stages.prospect.count).toBeGreaterThanOrEqual(1);
    expect(all.json.stages.declined).toMatchObject({ count: 1 });
    expect(all.json.partnerships[0].priority).toBe("high"); // high priority first
    expect((await call("GET", "?stage=declined", w.admin)).json.partnerships).toHaveLength(1);
    expect((await call("GET", "?q=PPB", w.admin)).json.partnerships.map((p: { country: string }) => p.country)).toEqual(["PPB"]);
    expect((await call("GET", "?q=awa", w.admin)).json.partnerships).toHaveLength(1);
    expect((await call("GET", "?stage=nonsense", w.admin)).status).toBe(422);
  });

  it("is for administrators only: 401 signed out, 403 for a federation seat and a referee, nothing written", async () => {
    const before = (await sql("SELECT COUNT(*) AS n FROM partnerships").first<{ n: number }>())!.n;
    for (const s of [w.seat, w.referee]) {
      expect((await call("GET", "", s)).status).toBe(403);
      expect((await create(s, { country: "PPF" })).status).toBe(403);
    }
    expect((await call("GET", "", null)).status).toBe(401);
    expect((await create(null, { country: "PPF" })).status).toBe(401);
    expect((await sql("SELECT COUNT(*) AS n FROM partnerships").first<{ n: number }>())!.n).toBe(before);
  });
});
