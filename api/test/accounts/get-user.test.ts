import { describe, expect, it } from "vitest";
import { addFederationSeat, addOfficial, addUser, api, login } from "../helpers";

describe("GET /users/:id", async () => {
  const adminId = await addUser("gu-admin@aris.test", "admin");
  const sa = await addFederationSeat("GUA");
  const sb = await addFederationSeat("GUB");
  await addOfficial("gu-a", "GUA");
  await addOfficial("gu-b", "GUB");
  const refA = await addUser("gu-ref-a@aris.test", "referee", { officialId: "gu-a" });
  const refB = await addUser("gu-ref-b@aris.test", "referee", { officialId: "gu-b" });
  const admin = await login("gu-admin@aris.test");
  const fedA = await login(sa.email);
  const ref = await login("gu-ref-a@aris.test");

  it("returns one account in the list's row shape", async () => {
    const res = await api("GET", `/api/v1/users/${refA}`, { session: admin });
    expect(res.status).toBe(200);
    expect(res.json.user).toMatchObject({ id: refA, role: "referee", officialId: "gu-a", country: "GUA", active: true, mustChangePassword: false });
    expect(res.json.user).not.toHaveProperty("password_hash");
  });

  it("lets a federation read its own country's accounts only — others are not found", async () => {
    expect((await api("GET", `/api/v1/users/${refA}`, { session: fedA })).status).toBe(200);
    expect((await api("GET", `/api/v1/users/${sa.userId}`, { session: fedA })).status).toBe(200);
    expect((await api("GET", `/api/v1/users/${refB}`, { session: fedA })).status).toBe(404);
    expect((await api("GET", `/api/v1/users/${sb.userId}`, { session: fedA })).status).toBe(404);
    expect((await api("GET", `/api/v1/users/${adminId}`, { session: fedA })).status).toBe(404);
    expect((await api("GET", "/api/v1/users/nope", { session: admin })).status).toBe(404);
  });

  it("is staff only", async () => {
    expect((await api("GET", `/api/v1/users/${refA}`, { session: ref })).status).toBe(403);
    expect((await api("GET", `/api/v1/users/${refA}`)).status).toBe(401);
  });
});
