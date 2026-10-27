// Table-driven isolation matrix. Four callers (+ anonymous) hit every staff-facing endpoint this slice owns, on a
// resource of country A and on one of country B, and the answer must be exactly what the rules say:
//   200/201/302 allowed · 404 another country's record · 403 wrong role · 401 no session
import { describe, expect, it } from "vitest";
import { addFederationSeat, addOfficial, addStadium, addTeam, addUser, api, login, png, upload, type Session } from "../helpers";

const ACTORS = ["fedA", "fedB", "refA", "admin", "anon"] as const;
type Actor = (typeof ACTORS)[number];

describe("isolation matrix", async () => {
  // ---- world: two countries, each with an official + referee account, a team, a stadium, a federation
  await addUser("mx-admin@aris.test", "admin");
  const sa = await addFederationSeat("MXA");
  const sb = await addFederationSeat("MXB");
  await addOfficial("mx-a1", "MXA");
  await addOfficial("mx-a2", "MXA");
  await addOfficial("mx-b1", "MXB");
  await addUser("mx-ref-a@aris.test", "referee", { officialId: "mx-a1" });
  const victimA = await addUser("mx-victim-a@aris.test", "referee", { officialId: "mx-a2" });
  await addUser("mx-ref-b@aris.test", "referee", { officialId: "mx-b1" });
  const victimB = await addUser("mx-victim-b@aris.test", "admin");
  void victimB;
  const teamA = await addTeam("MX Team A", "MXA");
  const teamB = await addTeam("MX Team B", "MXB");
  const stadiumA = await addStadium("MX Stadium A", "Axville", "MXA");
  const stadiumB = await addStadium("MX Stadium B", "Bxville", "MXB");

  const sessions: Record<Actor, Session | null> = {
    fedA: await login(sa.email),
    fedB: await login(sb.email),
    refA: await login("mx-ref-a@aris.test"),
    admin: await login("mx-admin@aris.test"),
    anon: null,
  };
  const { admin, refA } = sessions as Record<"admin" | "refA", Session>;

  // data the rows point at
  const flagA = (await upload(admin, "PUT", "/countries/MXA/flag", png(1), "f.png")).json.country.flagUrl as string;
  const photoA = (await upload(refA, "POST", "/officials/mx-a1/documents", png(2), "p.png", { kind: "photo" })).json.document;
  const docA = (await upload(refA, "POST", "/officials/mx-a1/documents", png(3), "d.png", { kind: "medical" })).json.document;
  const docB = (await upload(sessions.fedB, "POST", "/officials/mx-b1/documents", png(4), "d.png", { kind: "medical" })).json.document;
  const userA = (await api("GET", "/api/v1/users?q=mx-victim-a", { session: admin })).json.users[0].id as string;
  void victimA;

  type Expect = [number, number, number, number, number]; // fedA, fedB, refA, admin, anon
  interface Row {
    name: string;
    method: string;
    path: string;
    body?: object;
    file?: { fields?: Record<string, string> };
    /** Run before every actor's turn: a DELETE consumes the row it acts on, so each successful actor needs it put back. */
    before?: () => Promise<unknown>;
    expect: Expect;
  }
  const rows: Row[] = [
    // --- officials
    { name: "read own-country official", method: "GET", path: "/officials/mx-a1", expect: [200, 404, 200, 200, 401] },
    { name: "read foreign-country official", method: "GET", path: "/officials/mx-b1", expect: [404, 200, 403, 200, 401] },
    { name: "read a colleague's file", method: "GET", path: "/officials/mx-a2", expect: [200, 404, 403, 200, 401] },
    { name: "list officials", method: "GET", path: "/officials", expect: [200, 200, 403, 200, 401] },
    { name: "read availability", method: "GET", path: "/officials/mx-a1/availability", expect: [200, 404, 200, 200, 401] },
    { name: "read availability (foreign)", method: "GET", path: "/officials/mx-b1/availability", expect: [404, 200, 403, 200, 401] },
    { name: "read photo", method: "GET", path: "/officials/mx-a1/photo", expect: [302, 404, 302, 302, 401] },
    { name: "update official", method: "PATCH", path: "/officials/mx-a1", body: { city: "Axville" }, expect: [200, 404, 200, 200, 401] },
    { name: "update official (foreign)", method: "PATCH", path: "/officials/mx-b1", body: { city: "Bxville" }, expect: [404, 200, 403, 200, 401] },
    { name: "declare availability", method: "PUT", path: "/officials/mx-a1/availability", body: { dates: ["2037-01-01"], state: "resting" }, expect: [200, 404, 200, 200, 401] },
    {
      name: "clear availability",
      method: "DELETE",
      path: "/officials/mx-a1/availability/2037-01-01",
      // re-declared before each actor's turn: a successful DELETE removes the row, so the next actor would
      // otherwise find nothing there and 404 regardless of whether they are allowed to clear it
      before: () => api("PUT", "/api/v1/officials/mx-a1/availability", { session: admin, body: { dates: ["2037-01-01"], state: "resting" } }),
      expect: [200, 404, 200, 200, 401],
    },
    { name: "upload document", method: "POST", path: "/officials/mx-a1/documents", file: { fields: { kind: "other" } }, expect: [201, 404, 201, 201, 401] },
    { name: "upload document (foreign)", method: "POST", path: "/officials/mx-b1/documents", file: { fields: { kind: "other" } }, expect: [404, 201, 403, 201, 401] },
    { name: "declare conflict (foreign)", method: "POST", path: "/officials/mx-b1/conflicts", body: { kind: "country", subject: "MXA" }, expect: [404, 201, 403, 409, 401] },
    // --- documents and media
    { name: "read document", method: "GET", path: `/documents/${docA.id}`, expect: [200, 404, 200, 200, 401] },
    { name: "read document (foreign)", method: "GET", path: `/documents/${docB.id}`, expect: [404, 200, 404, 200, 401] },
    { name: "review document", method: "PATCH", path: `/documents/${docA.id}/status`, body: { status: "pending" }, expect: [200, 404, 403, 200, 401] },
    { name: "private media", method: "GET", path: photoA.url, expect: [200, 404, 200, 200, 401] },
    { name: "private media (foreign)", method: "GET", path: docB.url, expect: [404, 200, 404, 200, 401] },
    { name: "public media", method: "GET", path: flagA, expect: [200, 200, 200, 200, 200] },
    // --- accounts
    { name: "list users", method: "GET", path: "/users", expect: [200, 200, 403, 200, 401] },
    { name: "update a referee account", method: "PATCH", path: `/users/${userA}`, body: { name: "Victim A" }, expect: [200, 404, 403, 200, 401] },
    { name: "reset a referee's password", method: "POST", path: `/users/${userA}/reset-password`, body: { password: "brand-new-long-password" }, expect: [200, 404, 403, 200, 401] },
    // --- reference data
    { name: "list countries", method: "GET", path: "/countries", expect: [200, 200, 200, 200, 401] },
    { name: "patch country", method: "PATCH", path: "/countries/MXA", body: { capital: "Capital" }, expect: [403, 403, 403, 200, 401] },
    { name: "upload flag", method: "PUT", path: "/countries/MXA/flag", file: {}, expect: [403, 403, 403, 200, 401] },
    { name: "list federations", method: "GET", path: "/federations", expect: [200, 200, 403, 200, 401] },
    { name: "patch federation (even its own)", method: "PATCH", path: `/federations/${sa.federationId}`, body: { name: "Renamed" }, expect: [403, 403, 403, 200, 401] },
    { name: "federation logo", method: "PUT", path: `/federations/${sa.federationId}/logo`, file: {}, expect: [403, 403, 403, 200, 401] },
    { name: "list teams", method: "GET", path: "/teams", expect: [200, 200, 403, 200, 401] },
    { name: "update team", method: "PATCH", path: `/teams/${teamA}`, body: { shortName: "TA" }, expect: [200, 404, 403, 200, 401] },
    { name: "update team (foreign)", method: "PATCH", path: `/teams/${teamB}`, body: { shortName: "TB" }, expect: [404, 200, 403, 200, 401] },
    { name: "team crest", method: "PUT", path: `/teams/${teamA}/logo`, file: {}, expect: [200, 404, 403, 200, 401] },
    { name: "team crest (foreign)", method: "PUT", path: `/teams/${teamB}/logo`, file: {}, expect: [404, 200, 403, 200, 401] },
    { name: "create team in a foreign country", method: "POST", path: "/teams", body: { name: "Intruder", kind: "club", country: "MXB" }, expect: [404, 201, 403, 409, 401] },
    { name: "list stadiums", method: "GET", path: "/stadiums", expect: [200, 200, 403, 200, 401] },
    { name: "update stadium", method: "PATCH", path: `/stadiums/${stadiumA}`, body: { capacity: 10000 }, expect: [200, 404, 403, 200, 401] },
    { name: "update stadium (foreign)", method: "PATCH", path: `/stadiums/${stadiumB}`, body: { capacity: 10000 }, expect: [404, 200, 403, 200, 401] },
    // --- the rest
    { name: "audit trail", method: "GET", path: "/audit", expect: [200, 200, 403, 200, 401] },
    { name: "notifications", method: "GET", path: "/notifications", expect: [200, 200, 200, 200, 401] },
    { name: "my space", method: "GET", path: "/me", expect: [403, 403, 200, 403, 401] },
    { name: "run jobs", method: "POST", path: "/admin/run-jobs", expect: [403, 403, 403, 200, 401] },
  ];

  for (const row of rows) {
    it(`${row.method} ${row.name}`, async () => {
      for (const [i, actor] of ACTORS.entries()) {
        if (row.before) await row.before();
        const session = sessions[actor];
        const res = row.file
          ? await upload(session, row.method, row.path, png(10 + i), "x.png", row.file.fields)
          : await api(row.method, row.path.startsWith("/api") ? row.path : `/api/v1${row.path}`, { session, body: row.body });
        expect(res.status, `${actor} ${row.method} ${row.path}: ${res.text.slice(0, 200)}`).toBe(row.expect[i]);
      }
    });
  }

  // a 404 must also mean "nothing happened"
  it("left no trace of the refused writes", async () => {
    const { json } = await api("GET", "/api/v1/teams?country=MXB", { session: admin });
    expect((json.teams as Array<{ name: string }>).filter((t) => t.name === "Intruder")).toHaveLength(1); // only fedB's own, never fedA's
    const a = await api("GET", "/api/v1/officials/mx-b1", { session: admin });
    expect(a.json.official.city).toBe("Bxville");
  });
});

describe("lists never leak across countries", async () => {
  await addUser("ls-admin@aris.test", "admin");
  const sa = await addFederationSeat("LSA");
  const sb = await addFederationSeat("LSB");
  await addOfficial("ls-a", "LSA");
  await addOfficial("ls-b", "LSB");
  await addUser("ls-ref-a@aris.test", "referee", { officialId: "ls-a" });
  await addUser("ls-ref-b@aris.test", "referee", { officialId: "ls-b" });
  await addTeam("LS A", "LSA");
  await addTeam("LS B", "LSB");
  await addStadium("LS Stadium A", "A", "LSA");
  await addStadium("LS Stadium B", "B", "LSB");
  const admin = await login("ls-admin@aris.test");
  const fedA = await login(sa.email);
  const fedB = await login(sb.email);
  const get = async (s: Session, p: string) => (await api("GET", `/api/v1${p}`, { session: s })).json;

  it("users, officials, teams, stadiums, federations", async () => {
    const countries = (rows: Array<{ country?: string; countryCode?: string }>) => [...new Set(rows.map((r) => r.country ?? r.countryCode))];
    expect(countries((await get(fedA, "/users")).users)).toEqual(["LSA"]);
    expect(countries((await get(fedA, "/officials")).officials)).toEqual(["LSA"]);
    expect(countries((await get(fedA, "/teams")).teams)).toEqual(["LSA"]);
    expect(countries((await get(fedA, "/stadiums")).stadiums)).toEqual(["LSA"]);
    expect(countries((await get(fedA, "/federations")).federations)).toEqual(["LSA"]);
    expect(countries((await get(fedB, "/officials")).officials)).toEqual(["LSB"]);
    expect(countries((await get(admin, "/officials")).officials)).toEqual(expect.arrayContaining(["LSA", "LSB"]));
  });

  it("the audit trail is the country's own for a federation, everything for an admin", async () => {
    await api("PATCH", "/api/v1/officials/ls-a", { session: fedA, body: { city: "A-town" } });
    await api("PATCH", "/api/v1/officials/ls-b", { session: fedB, body: { city: "B-town" } });
    const own = (await get(fedA, "/audit?limit=200")).entries as Array<{ countryCode: string; entityId: string; ip: string | null }>;
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((e) => e.countryCode === "LSA")).toBe(true);
    expect(own.some((e) => e.entityId === "ls-b")).toBe(false);
    expect(own.every((e) => e.ip === null)).toBe(true); // addresses are for admins
    expect((await get(fedA, "/audit?entityId=ls-b")).entries).toEqual([]);
    const all = (await get(admin, "/audit?limit=200")).entries as Array<{ countryCode: string | null }>;
    expect(new Set(all.map((e) => e.countryCode))).toEqual(expect.objectContaining(new Set(["LSA", "LSB"])));
    const refSession = await login("ls-ref-a@aris.test");
    expect((await api("GET", "/api/v1/audit", { session: refSession })).status).toBe(403);
  });
});
