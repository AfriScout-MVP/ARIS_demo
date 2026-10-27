import { describe, expect, it } from "vitest";
import { addFederationSeat, addOfficial, addUser, api, login, sql } from "../helpers";

describe("sign out everywhere", async () => {
  await addUser("so-admin@aris.test", "admin");
  const seatA = await addFederationSeat("SOA");
  const seatB = await addFederationSeat("SOB");
  await addOfficial("so-ref", "SOA");
  const refId = await addUser("so-ref@aris.test", "referee", { officialId: "so-ref" });
  const admin = await login("so-admin@aris.test");
  const fedA = await login(seatA.email);
  const fedB = await login(seatB.email);
  const out = (s: typeof admin, id: string) => api("POST", `/api/v1/users/${id}/sign-out`, { session: s });
  const me = (s: typeof admin) => api("GET", "/api/v1/auth/me", { session: s });

  it("ends every session of the account, leaves the password alone and is audited", async () => {
    const laptop = await login("so-ref@aris.test");
    const phone = await login("so-ref@aris.test");
    expect((await out(admin, refId)).json).toEqual({ ok: true, self: false });
    expect((await me(laptop)).status).toBe(401);
    expect((await me(phone)).status).toBe(401);
    expect((await me(await login("so-ref@aris.test"))).status).toBe(200); // the same password still works
    expect((await sql("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'user.sign_out_everywhere' AND entity_id = ?", refId).first<{ n: number }>())!.n).toBe(1);
  });

  it("is open to the federation of the referee's country, 404 for another country", async () => {
    expect((await out(fedB, refId)).status).toBe(404);
    expect((await out(fedA, refId)).status).toBe(200);
  });

  it("a federation seat cannot sign out an administrator; anyone may sign out their own account", async () => {
    expect((await out(fedA, admin.user.id)).status).toBe(404);
    const self = await login(seatA.email);
    expect((await out(self, self.user.id)).json).toEqual({ ok: true, self: true });
    expect((await me(self)).status).toBe(401);
  });

  it("answers 404 for an unknown account", async () => {
    expect((await out(admin, "nobody")).status).toBe(404);
  });
});
