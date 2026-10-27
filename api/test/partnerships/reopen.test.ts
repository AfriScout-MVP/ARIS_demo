import { describe, expect, it } from "vitest";
import { sql } from "../helpers";
import { call, create, makePipelineWorld, move, prospectCountry } from "./support";

const SEAT = { name: "Ama Owusu", email: "ama@prb.org", password: "a-long-onboarding-passphrase", locale: "en" };
const count = async (table: string, where: string, ...args: Array<string | number | null>) => (await sql(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`, ...args).first<{ n: number }>())!.n;

describe("reopening and deleting partnerships", async () => {
  const w = await makePipelineWorld("PR");

  it("puts a declined partnership back into talks, with the reason on the timeline", async () => {
    await prospectCountry("PRB");
    const { id } = (await create(w.admin, { country: "PRB" })).json.partnership;
    await move(w.admin, id, { stage: "declined", reason: "No budget this season" });
    const res = await call("POST", `/${id}/reopen`, w.admin, { reason: "New board elected, budget approved" });
    expect(res.status).toBe(200);
    expect(res.json.partnership).toMatchObject({ stage: "contacted", declinedReason: null });
    const ev = await sql("SELECT from_stage, to_stage, body FROM partnership_events WHERE partnership_id = ? ORDER BY id DESC LIMIT 1", id).first();
    expect(ev).toEqual({ from_stage: "declined", to_stage: "contacted", body: "New board elected, budget approved" });
    expect(await count("audit_log", "action = 'partnership.reopen' AND entity_id = ? AND country_code = 'PRB'", id)).toBe(1);
  });

  it("refuses to reopen an open partnership, or a declined one when the country already has another open one", async () => {
    await prospectCountry("PRC");
    const first = (await create(w.admin, { country: "PRC" })).json.partnership.id;
    expect((await call("POST", `/${first}/reopen`, w.admin, { reason: "Because" })).json.error.code).toBe("not_closed");
    await move(w.admin, first, { stage: "declined", reason: "Went quiet" });
    const second = (await create(w.admin, { country: "PRC" })).json.partnership.id;
    const res = await call("POST", `/${first}/reopen`, w.admin, { reason: "They called back" });
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("partnership_exists");
    expect((await call("GET", `/${first}`, w.admin)).json.partnership.stage).toBe("declined");
    expect((await call("POST", `/${second}/reopen`, w.admin, {})).status).toBe(422);
  });

  it("reopens an onboarded partnership for a renegotiation that closes again without creating anything", async () => {
    await prospectCountry("PRD");
    const { id } = (await create(w.admin, { country: "PRD", federationCode: "PRDF" })).json.partnership;
    await move(w.admin, id, { stage: "negotiating" });
    await move(w.admin, id, { stage: "agreement_signed", agreementReference: "AGR-1", agreementSignedOn: "2026-10-01" });
    const fedId = (await call("POST", `/${id}/onboard`, w.admin, { seat: SEAT })).json.federationId;
    const reopened = await call("POST", `/${id}/reopen`, w.admin, { stage: "negotiating", reason: "Renewal of the agreement" });
    expect(reopened.json.partnership).toMatchObject({ stage: "negotiating", federationId: fedId });
    await move(w.admin, id, { stage: "agreement_signed", agreementReference: "AGR-2", agreementSignedOn: "2026-10-20" });
    const closed = await move(w.admin, id, { stage: "onboarded" });
    expect(closed.status).toBe(200);
    expect(closed.json.partnership).toMatchObject({ stage: "onboarded", federationId: fedId, agreementReference: "AGR-2" });
    expect(await count("federations", "country = 'PRD'")).toBe(1);
  });

  it("still sends a first onboarding through POST /:id/onboard", async () => {
    await prospectCountry("PRE");
    const { id } = (await create(w.admin, { country: "PRE" })).json.partnership;
    await move(w.admin, id, { stage: "negotiating" });
    await move(w.admin, id, { stage: "agreement_signed", agreementReference: "AGR-3", agreementSignedOn: "2026-10-01" });
    expect((await move(w.admin, id, { stage: "onboarded" })).json.error.code).toBe("use_onboard");
  });

  it("deletes an entry and its timeline; the audit keeps what it was", async () => {
    await prospectCountry("PRF");
    const { id } = (await create(w.admin, { country: "PRF", note: "Met at the CAF congress" })).json.partnership;
    const res = await call("DELETE", `/${id}`, w.admin);
    expect(res.status).toBe(200);
    expect(await count("partnerships", "id = ?", id)).toBe(0);
    expect(await count("partnership_events", "partnership_id = ?", id)).toBe(0);
    const log = await sql("SELECT before, country_code FROM audit_log WHERE action = 'partnership.delete' AND entity_id = ?", id).first<{ before: string; country_code: string }>();
    expect(JSON.parse(log!.before)).toMatchObject({ country: "PRF", stage: "prospect" });
    expect((await call("DELETE", `/${id}`, w.admin)).status).toBe(404);
  });

  it("is for administrators only", async () => {
    await prospectCountry("PRG");
    const { id } = (await create(w.admin, { country: "PRG" })).json.partnership;
    await move(w.admin, id, { stage: "declined", reason: "Not now" });
    for (const s of [w.seat, w.referee]) {
      expect((await call("DELETE", `/${id}`, s)).status).toBe(403);
      expect((await call("POST", `/${id}/reopen`, s, { reason: "Try again" })).status).toBe(403);
    }
    expect((await call("DELETE", `/${id}`, null)).status).toBe(401);
    expect(await count("partnerships", "id = ? AND stage = 'declined'", id)).toBe(1);
  });
});
