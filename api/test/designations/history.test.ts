import { beforeAll, describe, expect, it } from "vitest";
import { sql, uid } from "../helpers";
import { fixture, get, nextDate, put, world, type World } from "./support";

let w: World;
beforeAll(async () => {
  w = await world();
});

describe("the history is evidence", () => {
  it("cannot be edited or deleted, even directly in SQL", async () => {
    const id = uid("fx");
    await fixture(id, { country: "EGY", competition: "egy-d1", date: nextDate() });
    await put(w.egy, id, "R", { officialId: "egy-ref-1" });
    await expect(sql("UPDATE designation_history SET reason = 'x' WHERE fixture_id = ?", id).run()).rejects.toThrow(/append-only/);
    await expect(sql("DELETE FROM designation_history WHERE fixture_id = ?", id).run()).rejects.toThrow(/append-only/);
    await expect(sql("DELETE FROM audit_log").run()).rejects.toThrow(/append-only/);
  });

  it("is readable by the owning federation and the admin only", async () => {
    const id = uid("fx");
    await fixture(id, { country: "EGY", competition: "egy-d1", date: nextDate() });
    await put(w.egy, id, "R", { officialId: "egy-ref-1" });
    expect((await get(w.egy, `/fixtures/${id}/history`)).status).toBe(200);
    expect((await get(w.admin, `/fixtures/${id}/history`)).json.history).toHaveLength(1);
    expect((await get(w.mar, `/fixtures/${id}/history`)).status).toBe(404);
    expect((await get(w.referee, `/fixtures/${id}/history`)).status).toBe(403);
    expect((await get(null, `/fixtures/${id}/history`)).status).toBe(401);
  });

  it("writes an audit row with the fixture's country, which the federation of that country can read", async () => {
    const id = uid("fx");
    await fixture(id, { country: "EGY", competition: "egy-d1", date: nextDate() });
    await put(w.egy, id, "R", { officialId: "egy-ref-1" });
    const row = await sql("SELECT country_code, action FROM audit_log WHERE entity = 'fixture' AND entity_id = ?", id).first<{ country_code: string; action: string }>();
    expect(row).toEqual({ country_code: "EGY", action: "designation.assign" });
  });
});
