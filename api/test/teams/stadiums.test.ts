import { describe, expect, it } from "vitest";
import { addFederationSeat, addOfficial, addUser, api, login } from "../helpers";

describe("stadiums", async () => {
  await addUser("sd-admin@aris.test", "admin");
  const seat = await addFederationSeat("SDA");
  await addFederationSeat("SDB");
  await addOfficial("sd-off", "SDA");
  await addUser("sd-ref@aris.test", "referee", { officialId: "sd-off" });
  const admin = await login("sd-admin@aris.test");
  const fed = await login(seat.email);
  const ref = await login("sd-ref@aris.test");
  const post = (s: typeof admin | null, body: object) => api("POST", "/api/v1/stadiums", { session: s, body });

  it("creates, lists and patches a stadium", async () => {
    const res = await post(fed, { name: "Stade Municipal", city: "Sdaville", country: "SDA", capacity: 12000 });
    expect(res.status).toBe(201);
    expect(res.json.stadium).toMatchObject({ name: "Stade Municipal", city: "Sdaville", country: "SDA", capacity: 12000 });
    const id = res.json.stadium.id as string;
    expect((await api("GET", "/api/v1/stadiums?country=SDA", { session: fed })).json.stadiums).toHaveLength(1);
    const patched = await api("PATCH", `/api/v1/stadiums/${id}`, { session: fed, body: { capacity: 15000, city: "Sdacity" } });
    expect(patched.json.stadium).toMatchObject({ capacity: 15000, city: "Sdacity" });
    expect((await api("PATCH", `/api/v1/stadiums/${id}`, { session: fed, body: { capacity: null } })).json.stadium.capacity).toBeNull();
  });

  it("refuses duplicates and bad input", async () => {
    await post(admin, { name: "Twin", city: "Same", country: "SDA" });
    const dup = await post(admin, { name: "twin", city: "SAME", country: "SDA" });
    expect(dup.status).toBe(409);
    expect(dup.json.error.code).toBe("stadium_exists");
    expect((await post(admin, { name: "Twin", city: "Same", country: "SDB" })).status).toBe(201);
    expect((await post(admin, { name: "No City", country: "SDA" })).status).toBe(422);
    expect((await post(admin, { name: "Zero", city: "Z", country: "SDA", capacity: 0 })).status).toBe(422);
    expect((await post(admin, { name: "Nowhere", city: "Z", country: "ZZZ" })).json.error.code).toBe("unknown_country");
  });

  it("is closed to referees and the unauthenticated", async () => {
    expect((await api("GET", "/api/v1/stadiums", { session: ref })).status).toBe(403);
    expect((await post(ref, { name: "R", city: "R", country: "SDA" })).status).toBe(403);
    expect((await api("GET", "/api/v1/stadiums")).status).toBe(401);
  });
});
