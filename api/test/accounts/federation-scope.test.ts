import { describe, expect, it } from "vitest";
import { addFederationSeat, addOfficial, addUser, api, login, type Session } from "../helpers";

let a: Session;
let b: Session;
let refAId: string;
let refBId: string;
let seatA2Id: string;

const get = (s: Session | null, p: string) => api("GET", `/api/v1${p}`, { session: s });
const body = (o: object) => ({ name: "N", password: "long-enough-password", ...o });

describe("federation seat account scope", async () => {
  const sa = await addFederationSeat("FSA");
  const sb = await addFederationSeat("FSB");
  await addOfficial("fs-a1", "FSA");
  await addOfficial("fs-a2", "FSA");
  await addOfficial("fs-b1", "FSB");
  refAId = await addUser("ref-a1@aris.test", "referee", { officialId: "fs-a1" });
  refBId = await addUser("ref-b1@aris.test", "referee", { officialId: "fs-b1" });
  seatA2Id = await addUser("seat-a2@aris.test", "federation", { federationId: sa.federationId });
  await addUser("seat-b2@aris.test", "federation", { federationId: sb.federationId });
  await addUser("root-fs@aris.test", "admin");
  a = await login(sa.email);
  b = await login(sb.email);

  it("lists only the referee accounts of its country and the seats of its own federation", async () => {
    const list = (await get(a, "/users")).json.users as Array<{ email: string; role: string; country: string }>;
    const emails = list.map((u) => u.email).sort();
    expect(emails).toEqual(["ref-a1@aris.test", "seat-a2@aris.test", "seat-fsa@aris.test"]);
    expect(list.every((u) => u.country === "FSA")).toBe(true);
    // asking for another country (or role) never widens the answer
    expect((await get(a, "/users?country=FSB")).json.users).toEqual([]);
    expect((await get(a, "/users?role=admin")).json.users).toEqual([]);
    expect((await get(a, "/users?role=referee")).json.users).toHaveLength(1);
    expect(((await get(a, "/users?q=ref-a1")).json.users as unknown[]).length).toBe(1);
  });

  it("creates referee accounts for officials of its own country only", async () => {
    const ok = await api("POST", "/api/v1/users", { session: a, body: body({ email: "new-a2@aris.test", role: "referee", officialId: "fs-a2" }) });
    expect(ok.status).toBe(201);
    expect(ok.json.user.country).toBe("FSA");
    const foreign = await api("POST", "/api/v1/users", { session: a, body: body({ email: "new-b@aris.test", role: "referee", officialId: "fs-b1" }) });
    expect(foreign.status).toBe(404);
    expect((await api("POST", "/api/v1/users", { session: a, body: body({ email: "adm@aris.test", role: "admin" }) })).status).toBe(403);
    expect((await api("POST", "/api/v1/users", { session: a, body: body({ email: "fed@aris.test", role: "federation", federationId: "x" }) })).status).toBe(403);
    expect((await api("POST", "/api/v1/users", { session: a, body: body({ email: "noo@aris.test", role: "referee" }) })).status).toBe(422);
    expect((await get(b, "/users?q=new-b")).json.users).toEqual([]);
  });

  it("updates active / name / locale of its own referees, and nothing else", async () => {
    const res = await api("PATCH", `/api/v1/users/${refAId}`, { session: a, body: { name: "Ref A", locale: "es", active: true } });
    expect(res.status).toBe(200);
    expect(res.json.user).toMatchObject({ name: "Ref A", locale: "es" });
    for (const forbidden of [{ role: "admin" }, { officialId: "fs-a2" }, { federationId: null }]) {
      expect((await api("PATCH", `/api/v1/users/${refAId}`, { session: a, body: forbidden })).status).toBe(403);
    }
  });

  it("answers 404 for accounts of another country and 403 for its own federation's seats", async () => {
    expect((await api("PATCH", `/api/v1/users/${refBId}`, { session: a, body: { active: false } })).status).toBe(404);
    expect((await api("POST", `/api/v1/users/${refBId}/reset-password`, { session: a, body: { password: "brand-new-long-password" } })).status).toBe(404);
    expect((await api("PATCH", `/api/v1/users/${seatA2Id}`, { session: a, body: { active: false } })).status).toBe(403);
    expect((await api("PATCH", `/api/v1/users/does-not-exist`, { session: a, body: { active: false } })).status).toBe(404);
    // the foreign account is untouched
    const root = await login("root-fs@aris.test");
    expect((await get(root, `/users?country=FSB&role=referee`)).json.users[0].active).toBe(true);
  });

  it("deactivating a referee closes their session at once; reset-password works inside the country", async () => {
    const victim = await login("ref-a1@aris.test");
    expect((await api("GET", "/api/v1/me", { session: victim })).status).toBe(200);
    expect((await api("PATCH", `/api/v1/users/${refAId}`, { session: a, body: { active: false } })).status).toBe(200);
    expect((await api("GET", "/api/v1/me", { session: victim })).status).toBe(401);
    expect((await api("POST", `/api/v1/users/${refAId}/reset-password`, { session: a, body: { password: "brand-new-long-password" } })).status).toBe(200);
    expect((await api("PATCH", `/api/v1/users/${refAId}`, { session: a, body: { active: true } })).status).toBe(200);
    await login("ref-a1@aris.test", "brand-new-long-password");
  });
});
