import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers";
import { get, makeWorld, post, type World } from "../helpers/evaluation";

let w: World;
let courseA: string;
let courseB: string;
let platform: string;

beforeAll(async () => {
  w = await makeWorld("TXA", "TXB");
  const name = { fr: "Cours", en: "Course" };
  courseA = (await post(w.seatA, "/courses", { name, provider: "Prov A", hours: 5 })).json.id;
  courseB = (await post(w.seatB, "/courses", { name, provider: "Prov B", hours: 5 })).json.id;
  platform = (await post(w.admin, "/courses", { name, provider: "CAF", hours: 5 })).json.id;
});

const enrolments = (courseId: string) => sql("SELECT COUNT(*) AS n FROM course_enrolments WHERE course_id = ?", courseId).first<{ n: number }>().then((r) => r!.n);

describe("training is confined to the country", () => {
  it("answers 404 for another federation's course and refuses nothing silently", async () => {
    expect((await post(w.seatA, `/courses/${courseB}/enrol`, { officialIds: ["TXA-ref1"] })).status).toBe(404);
    expect((await post(w.seatA, `/courses/${courseB}/complete`, { officialIds: ["TXA-ref1"] })).status).toBe(404);
    expect((await post(w.seatA, "/courses/nope/enrol", { officialIds: ["TXA-ref1"] })).status).toBe(404);
    expect(await enrolments(courseB)).toBe(0);
  });

  it("answers 404 for a foreign official, enrolling nobody (all or nothing)", async () => {
    expect((await post(w.seatA, `/courses/${courseA}/enrol`, { officialIds: ["TXA-ref1", "TXB-ref1"] })).status).toBe(404);
    expect((await post(w.seatA, `/courses/${platform}/enrol`, { officialIds: ["TXB-ref1"] })).status).toBe(404);
    expect((await post(w.seatA, `/courses/${courseA}/enrol`, { officialIds: ["ghost"] })).status).toBe(404);
    expect(await enrolments(courseA)).toBe(0);
    expect(await enrolments(platform)).toBe(0);
  });

  it("only lets an admin enrol officials of another country in a federation's course after the right match", async () => {
    expect((await post(w.admin, `/courses/${courseA}/enrol`, { officialIds: ["TXB-ref1"] })).json.error.code).toBe("official_not_eligible");
    expect((await post(w.admin, `/courses/${courseA}/enrol`, { officialIds: ["TXA-ref1"] })).status).toBe(200);
    expect((await post(w.admin, `/courses/${platform}/enrol`, { officialIds: ["TXA-ref1", "TXB-ref1"] })).json.enrolled).toBe(2);
  });

  it("does not let a federation create platform-wide courses or courses for another federation", async () => {
    const body = { name: { fr: "Cours", en: "Course" }, provider: "Prov X", hours: 3 };
    expect((await post(w.seatA, "/courses", { ...body, federationId: null })).status).toBe(403);
    expect((await post(w.seatA, "/courses", { ...body, federationId: w.fedB })).status).toBe(404);
    expect((await post(w.admin, "/courses", { ...body, federationId: "no-such-federation" })).status).toBe(404);
    expect((await get(w.seatA, "/courses")).json.courses.map((c: { id: string }) => c.id).sort()).toEqual([courseA, platform].sort());
  });
});
