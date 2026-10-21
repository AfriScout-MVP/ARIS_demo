import { describe, expect, it } from "vitest";
import { addFederation, addOfficial, addUser, api, login, sql, uid } from "../helpers";

const patch = (s: Awaited<ReturnType<typeof login>>, id: string, body: object) => api("PATCH", `/api/v1/users/${id}`, { session: s, body });
const create = (s: Awaited<ReturnType<typeof login>>, body: object) =>
  api("POST", "/api/v1/users", { session: s, body: { name: "N", password: "long-enough-password", ...body } });

describe("administrator safety", () => {
  it("never leaves the platform without an active administrator", async () => {
    await sql("UPDATE users SET active = 0 WHERE role = 'admin'").run(); // a clean slate for this assertion
    const aId = await addUser("root-a@aris.test", "admin");
    const bId = await addUser("root-b@aris.test", "admin");
    const a = await login("root-a@aris.test");
    expect((await patch(a, bId, { active: false })).status).toBe(200);
    const deactivate = await patch(a, aId, { active: false });
    expect(deactivate.status).toBe(409);
    expect(deactivate.json.error.code).toBe("last_admin");
    const fed = await addFederation("ADS");
    const demote = await patch(a, aId, { role: "federation", federationId: fed });
    expect(demote.status).toBe(409);
    // nothing changed, and no audit row claims it did
    expect((await sql("SELECT role, active FROM users WHERE id = ?", aId).first<{ role: string; active: number }>())).toEqual({ role: "admin", active: 1 });
    expect((await sql("SELECT COUNT(*) AS n FROM audit_log WHERE entity_id = ? AND action = 'user.update'", aId).first<{ n: number }>())!.n).toBe(0);
  });

  it("signs a user out everywhere the moment their role, status or federation changes", async () => {
    await addUser("boss@aris.test", "admin");
    const fedA = await addFederation("ADA");
    const fedB = await addFederation("ADB");
    const seatId = await addUser("seat-change@aris.test", "federation", { federationId: fedA });
    const boss = await login("boss@aris.test");

    let seat = await login("seat-change@aris.test");
    expect((await patch(boss, seatId, { federationId: fedB })).status).toBe(200);
    expect((await api("GET", "/api/v1/auth/me", { session: seat })).status).toBe(401);

    seat = await login("seat-change@aris.test");
    expect(seat.user.country).toBe("ADB");
    expect((await patch(boss, seatId, { active: false })).status).toBe(200);
    expect((await api("GET", "/api/v1/auth/me", { session: seat })).status).toBe(401);
    expect((await patch(boss, seatId, { active: true })).status).toBe(200);

    seat = await login("seat-change@aris.test");
    expect((await patch(boss, seatId, { name: "Renamed", locale: "es" })).status).toBe(200);
    expect((await api("GET", "/api/v1/auth/me", { session: seat })).status).toBe(200); // cosmetic changes keep the session

    const res = await api("POST", `/api/v1/users/${seatId}/reset-password`, { session: boss, body: { password: "brand-new-long-password" } });
    expect(res.status).toBe(200);
    expect((await api("GET", "/api/v1/auth/me", { session: seat })).status).toBe(401);
  });

  it("keeps role, federation and official consistent", async () => {
    const admin = await login((await addUser("consistency@aris.test", "admin"), "consistency@aris.test"));
    const fed = await addFederation("ADC");
    await addOfficial("ad-off-1", "ADC");
    await addOfficial("ad-off-2", "ADC");

    expect((await create(admin, { email: "r1@aris.test", role: "referee" })).json.error.code).toBe("official_required");
    expect((await create(admin, { email: "r2@aris.test", role: "referee", officialId: "nope" })).json.error.code).toBe("unknown_official");
    expect((await create(admin, { email: "r3@aris.test", role: "referee", officialId: "ad-off-1", federationId: fed })).json.error.code).toBe("invalid_link");
    expect((await create(admin, { email: "f1@aris.test", role: "federation" })).json.error.code).toBe("federation_required");
    expect((await create(admin, { email: "f2@aris.test", role: "federation", federationId: "nope" })).json.error.code).toBe("unknown_federation");
    expect((await create(admin, { email: "f3@aris.test", role: "federation", federationId: fed, officialId: "ad-off-1" })).json.error.code).toBe("invalid_link");
    expect((await create(admin, { email: "a1@aris.test", role: "admin", federationId: fed })).json.error.code).toBe("invalid_link");

    const ok = await create(admin, { email: "Seat@Aris.Test", role: "federation", federationId: fed, locale: "de" });
    expect(ok.status).toBe(201);
    expect(ok.json.user).toMatchObject({ email: "seat@aris.test", role: "federation", federationCode: "ADCFF", country: "ADC", locale: "de", active: true });
    expect(ok.json.user).not.toHaveProperty("password_hash");

    const ref = await create(admin, { email: "ref1@aris.test", role: "referee", officialId: "ad-off-1" });
    expect(ref.status).toBe(201);
    expect(ref.json.user).toMatchObject({ officialId: "ad-off-1", country: "ADC" });
    expect((await create(admin, { email: "ref1b@aris.test", role: "referee", officialId: "ad-off-1" })).json.error.code).toBe("official_has_account");
    expect((await create(admin, { email: "ref1@aris.test", role: "referee", officialId: "ad-off-2" })).json.error.code).toBe("email_taken");
    expect((await create(admin, { email: "x@aris.test", role: "admin", locale: "xx" })).status).toBe(422);

    // role changes: the link the new role cannot have is dropped, the one it needs must be supplied
    const id = ref.json.user.id;
    expect((await patch(admin, id, { role: "federation" })).json.error.code).toBe("federation_required");
    const moved = await patch(admin, id, { role: "federation", federationId: fed });
    expect(moved.status).toBe(200);
    expect(moved.json.user).toMatchObject({ role: "federation", officialId: null, federationId: fed });
    expect((await patch(admin, id, { role: "referee" })).json.error.code).toBe("official_required");
    expect((await sql("SELECT COUNT(*) AS n FROM audit_log WHERE entity_id = ?", id).first<{ n: number }>())!.n).toBeGreaterThan(1);
    void uid;
  });
});
