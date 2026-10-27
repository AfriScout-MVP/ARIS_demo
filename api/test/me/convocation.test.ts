import { describe, expect, it } from "vitest";
import { addCompetition, addCountry, addFederationSeat, addFixture, addOfficial, addUser, api, login, sql } from "../helpers";

describe("my convocation", async () => {
  await addCountry("CVA", { timezone: "Africa/Cairo" });
  const seat = await addFederationSeat("CVA");
  await addCompetition("cva-d1", "CVA");
  for (const id of ["cv-1", "cv-2", "cv-3", "cv-4"]) await addOfficial(id, "CVA");
  await addUser("cv-ref1@aris.test", "referee", { officialId: "cv-1" });
  await addUser("cv-ref2@aris.test", "referee", { officialId: "cv-2" });
  await addUser("cv-ref4@aris.test", "referee", { officialId: "cv-4" });
  const ref1 = await login("cv-ref1@aris.test");
  const ref2 = await login("cv-ref2@aris.test");
  const ref4 = await login("cv-ref4@aris.test");
  const fed = await login(seat.email);
  const get = (s: typeof ref1 | null, id: string) => api("GET", `/api/v1/me/convocations/${id}`, { session: s });

  await addFixture("cv-fx", { country: "CVA", competition: "cva-d1", date: "2036-04-04", time: "16:00", roles: ["R", "AR1", "AR2"] });
  await sql("UPDATE designations SET official_id = 'cv-1', state = 'confirmed' WHERE fixture_id = 'cv-fx' AND role = 'R'").run();
  await sql("UPDATE designations SET official_id = 'cv-2', state = 'pending' WHERE fixture_id = 'cv-fx' AND role = 'AR1'").run();
  await sql("UPDATE designations SET official_id = 'cv-3', state = 'confirmed' WHERE fixture_id = 'cv-fx' AND role = 'AR2'").run();

  it("waits for the published crew", async () => {
    const res = await get(ref1, "cv-fx");
    expect([res.status, res.json.error.code]).toEqual([409, "not_published"]);
  });

  it("gives the accepted official their convocation, with the crew by name only", async () => {
    await sql("UPDATE fixtures SET designation_status = 'published', published_at = '2036-03-01T10:00:00Z' WHERE id = 'cv-fx'").run();
    const res = await get(ref1, "cv-fx");
    expect(res.status).toBe(200);
    expect(res.json.convocation).toMatchObject({
      fixtureId: "cv-fx",
      role: "R",
      competition: "League cva-d1",
      date: "2036-04-04",
      kickoff: "18:00",
      kickoffAt: "2036-04-04T16:00:00Z",
      timezone: "Africa/Cairo",
      issuer: { name: "Federation CVA", code: "CVAFF" },
      official: { name: "Official cv-1" },
      publishedAt: "2036-03-01T10:00:00Z",
    });
    expect(res.json.convocation.crew).toEqual([
      { role: "R", name: "Official cv-1", me: true },
      { role: "AR1", name: "Official cv-2", me: false },
      { role: "AR2", name: "Official cv-3", me: false },
    ]);
    expect(JSON.stringify(res.json)).not.toMatch(/email|phone/);
  });

  it("is nobody else's: not accepted yet, not designated, staff, signed out", async () => {
    expect((await get(ref2, "cv-fx")).status).toBe(404);
    expect((await get(ref4, "cv-fx")).status).toBe(404);
    expect((await get(ref1, "nope")).status).toBe(404);
    expect((await get(fed, "cv-fx")).status).toBe(403);
    expect((await get(null, "cv-fx")).status).toBe(401);
  });
});
