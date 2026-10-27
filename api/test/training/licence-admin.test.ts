import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers";
import { del, makeWorld, official, patch, post, type World } from "../helpers/evaluation";

let w: World;
beforeAll(async () => {
  w = await makeWorld("TKA", "TKB");
});

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const add = async (extra: object = {}) =>
  (await post(w.seatA, "/licences", { officialId: "TKA-ref1", kind: "National D1", issued: "2024-01-01", expires: day(300), ...extra })).json.id as string;
const row = (id: string) => sql("SELECT * FROM licences WHERE id = ?", id).first<Record<string, any>>();

describe("licence kind change and removal", () => {
  it("changes the kind of a licence, and VAR eligibility follows", async () => {
    const id = await add();
    expect((await patch(w.seatA, `/licences/${id}`, { kind: "VAR Certification" })).status).toBe(200);
    expect((await row(id))!.kind).toBe("VAR Certification");
    expect((await official("TKA-ref1")).var_qualified).toBe(1);
    const audit = await sql("SELECT before, after FROM audit_log WHERE action = 'licence.change_kind' AND entity_id = 'TKA-ref1'").first<{ before: string; after: string }>();
    expect(JSON.parse(audit!.before).kind).toBe("National D1");
    expect(JSON.parse(audit!.after).kind).toBe("VAR Certification");
    expect((await patch(w.seatA, `/licences/${id}`, { kind: "Pilot Licence" })).status).toBe(422);
  });

  it("is deleted by an administrator only; VAR eligibility follows", async () => {
    const id = (await sql("SELECT id FROM licences WHERE official_id = 'TKA-ref1' AND kind = 'VAR Certification'").first<{ id: string }>())!.id;
    expect((await del(w.seatA, `/licences/${id}`)).status).toBe(403);
    expect((await del(w.refA1, `/licences/${id}`)).status).toBe(403);
    expect((await del(null, `/licences/${id}`)).status).toBe(401);
    expect(await row(id)).not.toBeNull();
    expect((await del(w.admin, `/licences/${id}`)).status).toBe(200);
    expect(await row(id)).toBeNull();
    expect((await del(w.admin, `/licences/${id}`)).status).toBe(404);
    expect((await sql("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'licence.delete' AND entity_id = 'TKA-ref1'").first<{ n: number }>())!.n).toBe(1);
  });

  it("keeps another country's licences out of reach", async () => {
    const theirs = (await post(w.seatB, "/licences", { officialId: "TKB-ref1", kind: "FIFA Badge", issued: "2024-01-01", expires: day(300) })).json.id as string;
    expect((await patch(w.seatA, `/licences/${theirs}`, { kind: "National D1" })).status).toBe(404);
    expect((await row(theirs))!.kind).toBe("FIFA Badge");
  });
});
