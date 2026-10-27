import { describe, expect, it } from "vitest";
import { addFederationSeat, addUser, api, login } from "../helpers";

describe("tagger accounts", async () => {
  await addUser("tg-admin@aris.test", "admin");
  const admin = await login("tg-admin@aris.test");
  const seat = await addFederationSeat("TGA");
  const fedA = await login(seat.email);

  it("lets an admin create a tagger account linked to a federation", async () => {
    const res = await api("POST", "/api/v1/users", {
      session: admin,
      body: { email: "tagger-new@aris.test", name: "New Tagger", role: "tagger", federationId: seat.federationId, password: "correct-horse-battery-staple" },
    });
    expect(res.status).toBe(201);
    expect(res.json.user).toMatchObject({ role: "tagger", federationId: seat.federationId, country: "TGA" });
  });

  it("refuses a tagger account with no federation", async () => {
    const res = await api("POST", "/api/v1/users", {
      session: admin,
      body: { email: "tagger-bad@aris.test", name: "Bad Tagger", role: "tagger", password: "correct-horse-battery-staple" },
    });
    expect(res.status).toBe(422);
    expect(res.json.error.code).toBe("federation_required");
  });

  it("a federation seat cannot create a tagger account", async () => {
    const res = await api("POST", "/api/v1/users", {
      session: fedA,
      body: { email: "tagger-by-fed@aris.test", name: "Sneaky Tagger", role: "tagger", federationId: seat.federationId, password: "correct-horse-battery-staple" },
    });
    expect(res.status).toBe(403);
  });

  it("moving a federation seat to tagger keeps its existing federation link without resending it", async () => {
    const extraSeat = await addFederationSeat("TGB");
    const moved = await api("PATCH", `/api/v1/users/${extraSeat.userId}`, { session: admin, body: { role: "tagger" } });
    // this is the exact landmine the migration's CHECK guards against: before the fix, changing role to
    // "tagger" without resending federationId silently nulled it, which the CHECK then refuses
    expect(moved.status).toBe(200);
    expect(moved.json.user).toMatchObject({ role: "tagger", federationId: extraSeat.federationId, country: "TGB" });
  });

  it("a role with no federation to inherit still needs one supplied", async () => {
    const plainAdmin = await addUser("tg-plain-admin@aris.test", "admin");
    const moved = await api("PATCH", `/api/v1/users/${plainAdmin}`, { session: admin, body: { role: "tagger" } });
    expect(moved.status).toBe(422);
    expect(moved.json.error.code).toBe("federation_required");
  });
});
