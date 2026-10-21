import { beforeAll, describe, expect, it } from "vitest";
import { addCompetition, addCountry, addFederationSeat, addOfficial, addUser, api, login, sql, type Session } from "../helpers";

let admin: Session;
let egy: Session;
let mar: Session;
let referee: Session;

const get = (s: Session | null, path: string) => api("GET", `/api/v1${path}`, { session: s });
const post = (s: Session | null, path: string, body?: object) => api("POST", `/api/v1${path}`, { session: s, body });
const patch = (s: Session | null, path: string, body: object) => api("PATCH", `/api/v1${path}`, { session: s, body });

const league = (extra: object = {}) => ({ name: "Premier League", tier: "d1", season: "2026/2027", matchdays: 34, ...extra });

beforeAll(async () => {
  await addCompetition("mar-seed", "MAR");
  await addCountry("EGY");
  await addCountry("GHA", { active: false });
  egy = await login((await addFederationSeat("EGY")).email);
  mar = await login((await addFederationSeat("MAR")).email);
  await addUser("admin@aris.test", "admin");
  await addOfficial("cmp-ref", "EGY");
  await addUser("ref@aris.test", "referee", { officialId: "cmp-ref" });
  admin = await login("admin@aris.test");
  referee = await login("ref@aris.test");
});

describe("POST /competitions", () => {
  it("lets a federation create a competition in its own country", async () => {
    const res = await post(egy, "/competitions", league({ varEnabled: true }));
    expect(res.status).toBe(201);
    expect(res.json.competition).toMatchObject({ countryCode: "EGY", name: "Premier League", tier: "d1", gender: "M", season: "2026/2027", matchdays: 34, currentMatchday: 0, varEnabled: true, weight: 1, isActive: true });
    expect(await sql("SELECT country_code, action FROM audit_log WHERE action = 'competition.create' AND entity_id = ?", res.json.competition.id).first()).toEqual({ country_code: "EGY", action: "competition.create" });
  });

  it("lets the admin create for any country, including CAF", async () => {
    expect((await post(admin, "/competitions", league({ countryCode: "MAR", id: "mar-botola" }))).status).toBe(201);
    const caf = await post(admin, "/competitions", league({ countryCode: "CAF", tier: "continental", name: "Champions League", id: "caf-champions", weight: 2 }));
    expect(caf.status).toBe(201);
    expect(caf.json.competition).toMatchObject({ countryCode: "CAF", tier: "continental", weight: 2 });
  });

  it("answers 404 when a federation names another country or CAF, and writes nothing", async () => {
    expect((await post(egy, "/competitions", league({ countryCode: "MAR", id: "intruder" }))).status).toBe(404);
    expect((await post(egy, "/competitions", league({ countryCode: "CAF", tier: "continental", id: "intruder2" }))).status).toBe(404);
    expect(await sql("SELECT COUNT(*) AS n FROM competitions WHERE id LIKE 'intruder%'").first()).toEqual({ n: 0 });
  });

  it("validates the body", async () => {
    expect((await post(egy, "/competitions", {})).status).toBe(422);
    expect((await post(egy, "/competitions", league({ season: "2026/27" }))).status).toBe(422);
    expect((await post(egy, "/competitions", league({ season: "2026/2028" }))).status).toBe(422);
    expect((await post(egy, "/competitions", league({ tier: "world" }))).status).toBe(422);
    expect((await post(egy, "/competitions", league({ matchdays: 0 }))).status).toBe(422);
    expect((await post(egy, "/competitions", league({ matchdays: 10, currentMatchday: 11 }))).status).toBe(422);
    expect((await post(egy, "/competitions", league({ tier: "continental" }))).json.error.code).toBe("tier_country_mismatch");
    expect((await post(admin, "/competitions", league({ countryCode: "CAF" }))).json.error.code).toBe("tier_country_mismatch");
    expect((await post(admin, "/competitions", league({ countryCode: "ZZZ" }))).json.error.code).toBe("unknown_country");
    expect((await post(admin, "/competitions", league({ countryCode: "GHA" }))).json.error.code).toBe("country_inactive");
  });

  it("refuses a duplicate id", async () => {
    expect((await post(egy, "/competitions", league({ id: "egy-dup" }))).status).toBe(201);
    expect((await post(egy, "/competitions", league({ id: "egy-dup" }))).status).toBe(409);
  });

  it("answers 401 and 403", async () => {
    expect((await post(null, "/competitions", league())).status).toBe(401);
    expect((await post(referee, "/competitions", league())).status).toBe(403);
  });
});

describe("GET /competitions", () => {
  it("lists a federation's own competitions only, and the admin all (optionally by country)", async () => {
    const mine = await get(egy, "/competitions");
    expect(mine.status).toBe(200);
    expect(mine.json.competitions.length).toBeGreaterThan(0);
    expect(mine.json.competitions.every((c: { countryCode: string }) => c.countryCode === "EGY")).toBe(true);
    expect((await get(egy, "/competitions?country=MAR")).json.competitions).toEqual([]);

    const all = await get(admin, "/competitions");
    expect(new Set(all.json.competitions.map((c: { countryCode: string }) => c.countryCode))).toEqual(new Set(["EGY", "MAR", "CAF"]));
    expect((await get(admin, "/competitions?country=MAR")).json.competitions.every((c: { countryCode: string }) => c.countryCode === "MAR")).toBe(true);
  });

  it("is 401 / 403 for the wrong caller, and one competition is 404 across borders", async () => {
    expect((await get(null, "/competitions")).status).toBe(401);
    expect((await get(referee, "/competitions")).status).toBe(403);
    expect((await get(egy, "/competitions/mar-botola")).status).toBe(404);
    expect((await get(egy, "/competitions/caf-champions")).status).toBe(404);
    expect((await get(mar, "/competitions/mar-botola")).status).toBe(200);
  });
});

describe("PATCH /competitions/:id", () => {
  it("updates the editable fields and audits the change", async () => {
    const res = await patch(mar, "/competitions/mar-botola", { name: "Botola Pro", tier: "d2", currentMatchday: 5, varEnabled: true, weight: 1.5, isActive: false });
    expect(res.status).toBe(200);
    expect(res.json.competition).toMatchObject({ name: "Botola Pro", tier: "d2", currentMatchday: 5, varEnabled: true, weight: 1.5, isActive: false });
    expect(await sql("SELECT country_code FROM audit_log WHERE action = 'competition.update' AND entity_id = 'mar-botola'").first()).toEqual({ country_code: "MAR" });
    expect((await patch(admin, "/competitions/mar-botola", { isActive: true })).json.competition.isActive).toBe(true);
  });

  it("validates, and never changes the season or the country", async () => {
    expect((await patch(mar, "/competitions/mar-botola", { currentMatchday: 99 })).status).toBe(422);
    expect((await patch(mar, "/competitions/mar-botola", { weight: -1 })).status).toBe(422);
    expect((await patch(mar, "/competitions/mar-botola", { tier: "continental" })).json.error.code).toBe("tier_country_mismatch");
    await patch(mar, "/competitions/mar-botola", { season: "2030/2031", countryCode: "EGY" });
    expect(await sql("SELECT country_code, season FROM competitions WHERE id = 'mar-botola'").first()).toEqual({ country_code: "MAR", season: "2026/2027" });
  });

  it("answers 404 across borders without changing anything, 401 and 403 otherwise", async () => {
    expect((await patch(egy, "/competitions/mar-botola", { name: "Hijacked" })).status).toBe(404);
    expect((await patch(egy, "/competitions/caf-champions", { name: "Hijacked" })).status).toBe(404);
    expect((await patch(egy, "/competitions/ghost", { name: "Hijacked" })).status).toBe(404);
    expect((await sql("SELECT name FROM competitions WHERE id = 'mar-botola'").first<{ name: string }>())!.name).toBe("Botola Pro");
    expect((await patch(null, "/competitions/mar-botola", { name: "x1" })).status).toBe(401);
    expect((await patch(referee, "/competitions/mar-botola", { name: "x1" })).status).toBe(403);
    expect((await patch(admin, "/competitions/caf-champions", { name: "CAF Champions League" })).status).toBe(200);
  });
});
