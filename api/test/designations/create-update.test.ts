import { beforeAll, describe, expect, it } from "vitest";
import { addCompetition, addCountry, addFederationSeat, addOfficial, addStadium, addTeam, addUser, login, sql, type Session } from "../helpers";
import { get, nextDate, patch, post, put, world, type World } from "./support";

let w: World;
let ken: Session;
let home: string;
let away: string;
let other: string;
let stadium: string;
let foreignStadium: string;
let foreignTeam: string;

beforeAll(async () => {
  await addCountry("KEN", { timezone: "Africa/Nairobi" });
  w = await world();
  await sql("UPDATE countries SET timezone = 'Africa/Cairo' WHERE code = 'EGY'").run();
  await addCompetition("ken-d1", "KEN", { varEnabled: true });
  await addCompetition("ken-d2", "KEN");
  await addCompetition("ken-cup", "KEN", { tier: "cup" });
  ken = await login((await addFederationSeat("KEN")).email);
  home = await addTeam("Gor Mahia", "KEN");
  away = await addTeam("AFC Leopards", "KEN");
  other = await addTeam("Tusker", "KEN");
  stadium = await addStadium("Kasarani", "Nairobi", "KEN");
  foreignStadium = await addStadium("Cairo Stadium", "Cairo", "EGY");
  foreignTeam = await addTeam("Zamalek", "EGY");
  await addOfficial("ken-ref", "KEN");
  await addUser("ken-ref@aris.test", "referee", { officialId: "ken-ref" });
});

let round = 0;
const body = (extra: object = {}) => ({ competitionId: "ken-d1", round: ++round, homeTeamId: home, awayTeamId: away, stadiumId: stadium, date: nextDate(), time: "15:00", ...extra });

describe("POST /fixtures", () => {
  it("stores the local kickoff as UTC and gives it back local, with the empty slots the competition needs", async () => {
    const res = await post(ken, "/fixtures", body({ date: "2031-03-01", time: "15:00" }));
    expect(res.status).toBe(201);
    const f = res.json.fixture;
    expect(f).toMatchObject({ countryCode: "KEN", date: "2031-03-01", kickoff: "15:00", kickoffAt: "2031-03-01T12:00:00Z", timezone: "Africa/Nairobi", home: "Gor Mahia", away: "AFC Leopards", venue: "Kasarani", city: "Nairobi", status: "scheduled", played: false, designationStatus: "draft", homeCode: null, awayCode: null });
    expect(f.crew.map((s: { role: string }) => s.role)).toEqual(["R", "AR1", "AR2", "FOURTH", "VAR", "AVAR"]);
    expect(f.crew.every((s: { state: string }) => s.state === "empty")).toBe(true);
    const audit = await sql("SELECT country_code FROM audit_log WHERE action = 'fixture.create' AND entity_id = ?", f.id).first();
    expect(audit).toEqual({ country_code: "KEN" });
  });

  it("keeps a local date that is a different UTC day", async () => {
    // 01:30 in Nairobi (UTC+3) is 22:30 UTC the day before
    const f = (await post(ken, "/fixtures", body({ date: "2031-04-10", time: "01:30" }))).json.fixture;
    expect(f).toMatchObject({ date: "2031-04-10", kickoff: "01:30", kickoffAt: "2031-04-09T22:30:00Z" });
    const listed = await get(ken, "/fixtures?from=2031-04-10&to=2031-04-10");
    expect(listed.json.fixtures.map((x: { id: string }) => x.id)).toContain(f.id);
    expect((await get(ken, "/fixtures?from=2031-04-09&to=2031-04-09")).json.fixtures.map((x: { id: string }) => x.id)).not.toContain(f.id);
  });

  it("adds an observer slot for cups and for important ties, and no VAR where the competition has none", async () => {
    const cup = (await post(ken, "/fixtures", body({ competitionId: "ken-cup" }))).json.fixture;
    expect(cup.crew.map((s: { role: string }) => s.role)).toEqual(["R", "AR1", "AR2", "FOURTH", "OBS"]);
    const big = (await post(ken, "/fixtures", body({ competitionId: "ken-d2", importance: 80 }))).json.fixture;
    expect(big.crew.map((s: { role: string }) => s.role)).toContain("OBS");
    expect(big.crew.map((s: { role: string }) => s.role)).not.toContain("VAR");
    const small = (await post(ken, "/fixtures", body({ competitionId: "ken-d2", importance: 30 }))).json.fixture;
    expect(small.risk).toBe("low");
    expect(small.crew).toHaveLength(4);
  });

  it("validates the body and the references", async () => {
    expect((await post(ken, "/fixtures", { competitionId: "ken-d1" })).status).toBe(422);
    expect((await post(ken, "/fixtures", body({ awayTeamId: home }))).status).toBe(422);
    expect((await post(ken, "/fixtures", body({ time: "25:99" }))).status).toBe(422);
    expect((await post(ken, "/fixtures", body({ homeTeamId: "ghost" }))).json.error.code).toBe("unknown_team");
    expect((await post(ken, "/fixtures", body({ stadiumId: "ghost" }))).json.error.code).toBe("unknown_stadium");
    expect((await post(ken, "/fixtures", body({ homeTeamId: foreignTeam }))).json.error.code).toBe("team_outside_country");
    expect((await post(ken, "/fixtures", body({ stadiumId: foreignStadium }))).json.error.code).toBe("stadium_outside_country");
  });

  it("refuses a duplicate pairing in the same round", async () => {
    const b = body();
    expect((await post(ken, "/fixtures", b)).status).toBe(201);
    expect((await post(ken, "/fixtures", { ...b, date: nextDate() })).status).toBe(409);
  });

  it("answers 401, 403 and 404 where it should", async () => {
    expect((await post(null, "/fixtures", body())).status).toBe(401);
    expect((await post(w.referee, "/fixtures", body())).status).toBe(403);
    // another country's competition (and an unknown one) is 404 for a federation, 422 unknown for an admin
    expect((await post(w.egy, "/fixtures", body())).status).toBe(404);
    expect((await post(w.egy, "/fixtures", body({ competitionId: "nope" }))).status).toBe(404);
    expect((await post(w.egy, "/fixtures", body({ competitionId: "caf-cl" }))).status).toBe(404);
    expect((await post(w.admin, "/fixtures", body({ competitionId: "nope" }))).json.error.code).toBe("unknown_competition");
    expect(await sql("SELECT COUNT(*) AS n FROM fixtures WHERE country_code = 'EGY' AND competition_id = 'ken-d1'").first()).toEqual({ n: 0 });
  });

  it("lets the admin create a continental tie between clubs of different countries", async () => {
    const res = await post(w.admin, "/fixtures", { competitionId: "caf-cl", round: 1, homeTeamId: home, awayTeamId: foreignTeam, stadiumId: foreignStadium, date: nextDate(), time: "20:00" });
    expect(res.status).toBe(201);
    expect(res.json.fixture).toMatchObject({ countryCode: "CAF", homeCode: "KEN", awayCode: "EGY", timezone: "Africa/Cairo" });
    expect(res.json.fixture.crew.map((s: { role: string }) => s.role)).toEqual(["R", "AR1", "AR2", "FOURTH", "VAR", "AVAR", "OBS"]);
  });
});

describe("PATCH /fixtures/:id", () => {
  it("reschedules in the venue's time zone and tells the designated officials", async () => {
    const f = (await post(ken, "/fixtures", body({ date: "2031-05-01", time: "15:00" }))).json.fixture;
    await put(ken, f.id, "R", { officialId: "ken-ref" });
    const res = await patch(ken, `/fixtures/${f.id}`, { date: "2031-05-02", time: "17:30" });
    expect(res.status).toBe(200);
    expect(res.json.fixture).toMatchObject({ date: "2031-05-02", kickoff: "17:30", kickoffAt: "2031-05-02T14:30:00Z" });
    const n = await sql("SELECT COUNT(*) AS n FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.official_id = 'ken-ref' AND n.title LIKE '%rescheduled%'").first<{ n: number }>();
    expect(n!.n).toBe(1);
  });

  it("needs a reason once a designation is confirmed, and records it", async () => {
    const f = (await post(ken, "/fixtures", body())).json.fixture;
    await put(ken, f.id, "R", { officialId: "ken-ref", state: "confirmed" });
    const noReason = await patch(ken, `/fixtures/${f.id}`, { status: "postponed" });
    expect(noReason.status).toBe(422);
    expect(noReason.json.error.code).toBe("reason_required");
    expect((await patch(ken, `/fixtures/${f.id}`, { time: "10:00" })).status).toBe(422);
    const ok = await patch(ken, `/fixtures/${f.id}`, { status: "postponed", reason: "Pitch unplayable" });
    expect(ok.json.fixture.status).toBe("postponed");
    // the crew is kept, not silently dropped
    expect(ok.json.fixture.crew.find((s: { role: string }) => s.role === "R")).toMatchObject({ officialId: "ken-ref", state: "confirmed" });
    const audit = await sql("SELECT reason FROM audit_log WHERE action = 'fixture.postponed' AND entity_id = ?", f.id).first();
    expect(audit).toEqual({ reason: "Pitch unplayable" });
    const notice = await sql("SELECT COUNT(*) AS n FROM notifications WHERE title LIKE '%postponed%' AND detail LIKE '%Pitch unplayable%'").first<{ n: number }>();
    expect(notice!.n).toBe(1);
    // a postponed match can be brought back
    expect((await patch(ken, `/fixtures/${f.id}`, { status: "scheduled", date: nextDate(), reason: "New date agreed" })).json.fixture.status).toBe("scheduled");
  });

  it("cancels, and a cancelled match takes no more designations", async () => {
    const f = (await post(ken, "/fixtures", body())).json.fixture;
    expect((await patch(ken, `/fixtures/${f.id}`, { status: "cancelled" })).json.fixture.status).toBe("cancelled");
    expect((await put(ken, f.id, "R", { officialId: "ken-ref" })).status).toBe(409);
  });

  it("changes the stadium (same instant) and importance, and validates it", async () => {
    const f = (await post(ken, "/fixtures", body({ stadiumId: null }))).json.fixture;
    expect(f.venue).toBe("");
    const moved = await patch(ken, `/fixtures/${f.id}`, { stadiumId: stadium, importance: 90, risk: "high" });
    expect(moved.json.fixture).toMatchObject({ venue: "Kasarani", importance: 90, risk: "high", kickoffAt: f.kickoffAt });
    expect((await patch(ken, `/fixtures/${f.id}`, { stadiumId: foreignStadium })).json.error.code).toBe("stadium_outside_country");
    expect((await patch(ken, `/fixtures/${f.id}`, { importance: 500 })).status).toBe(422);
    expect((await patch(ken, `/fixtures/${f.id}`, { status: "played" })).status).toBe(422);
  });

  it("is 401 / 403 / 404 for the wrong caller and changes nothing", async () => {
    const f = (await post(ken, "/fixtures", body())).json.fixture;
    expect((await patch(null, `/fixtures/${f.id}`, { importance: 5 })).status).toBe(401);
    expect((await patch(w.referee, `/fixtures/${f.id}`, { importance: 5 })).status).toBe(403);
    expect((await patch(w.egy, `/fixtures/${f.id}`, { importance: 5 })).status).toBe(404);
    expect(await sql("SELECT importance FROM fixtures WHERE id = ?", f.id).first()).toEqual({ importance: 60 });
  });
});
