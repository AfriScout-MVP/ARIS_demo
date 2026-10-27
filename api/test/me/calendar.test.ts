import { describe, expect, it } from "vitest";
import { addCompetition, addCountry, addFixture, addOfficial, addUser, api, login, sql } from "../helpers";
import { icsFold, icsText } from "../../src/routes/self-service";

describe("calendar export", async () => {
  await addCountry("ICA", { timezone: "Africa/Lagos" }); // UTC+1
  await addCompetition("ica-d1", "ICA");
  await addOfficial("ic-1", "ICA");
  await addOfficial("ic-2", "ICA");
  await addUser("ic-ref1@aris.test", "referee", { officialId: "ic-1", locale: "en" });
  await addUser("ic-ref2@aris.test", "referee", { officialId: "ic-2" });
  await addUser("ic-admin@aris.test", "admin");
  const ref1 = await login("ic-ref1@aris.test");
  const ref2 = await login("ic-ref2@aris.test");
  const admin = await login("ic-admin@aris.test");
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

  await addFixture("ic-fx1", { country: "ICA", competition: "ica-d1", date: day(10), time: "19:30", home: "Union Sportive, Douala; Est", away: "Back\\slash FC", roles: ["R", "AR1"] });
  await addFixture("ic-fx2", { country: "ICA", competition: "ica-d1", date: day(20), round: 2, roles: ["R"] });
  await addFixture("ic-fx3", { country: "ICA", competition: "ica-d1", date: day(30), round: 3, roles: ["R"] });
  await addFixture("ic-fx4", { country: "ICA", competition: "ica-d1", date: day(40), round: 4, roles: ["R"] });
  await sql("UPDATE designations SET official_id = 'ic-1', state = 'confirmed' WHERE fixture_id = 'ic-fx1' AND role = 'R'").run();
  await sql("UPDATE designations SET official_id = 'ic-2', state = 'confirmed' WHERE fixture_id = 'ic-fx1' AND role = 'AR1'").run();
  await sql("UPDATE designations SET official_id = 'ic-1', state = 'pending' WHERE fixture_id = 'ic-fx2'").run();
  await sql("UPDATE designations SET official_id = 'ic-1', state = 'declined' WHERE fixture_id = 'ic-fx3'").run();
  await sql("UPDATE designations SET official_id = 'ic-1', state = 'confirmed' WHERE fixture_id = 'ic-fx4'").run();
  await sql("UPDATE fixtures SET status = 'cancelled' WHERE id = 'ic-fx4'").run();

  const ics = await api("GET", "/api/v1/me/calendar.ics", { session: ref1 });

  it("is an RFC 5545 calendar with CRLF line endings", () => {
    expect(ics.status).toBe(200);
    expect(ics.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(ics.headers.get("content-disposition")).toContain("attachment");
    expect(ics.text.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:")).toBe(true);
    expect(ics.text.endsWith("END:VCALENDAR\r\n")).toBe(true);
    // every line break is CRLF, and no content line exceeds 75 octets
    expect(ics.text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    for (const line of ics.text.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });

  it("has one event per accepted or pending designation, never declined or cancelled ones", () => {
    const uids = [...ics.text.matchAll(/^UID:(.+)$/gm)].map((m) => m[1].trim());
    expect(uids).toEqual(["ic-fx1-R@aris", "ic-fx2-R@aris"]);
    const events = ics.text.split("BEGIN:VEVENT").slice(1);
    expect(events[0]).toContain("STATUS:CONFIRMED");
    expect(events[1]).toContain("STATUS:TENTATIVE");
    expect(ics.text).not.toContain("ic-fx1-AR1");
  });

  it("writes the kickoff in UTC with a Z, whatever the venue's time zone", () => {
    const compact = day(10).replace(/-/g, "");
    expect(ics.text).toContain(`DTSTART:${compact}T193000Z`);
    expect(ics.text).toContain(`DTEND:${compact}T213000Z`);
    expect(ics.text).not.toMatch(/TZID/);
  });

  it("escapes text values", () => {
    const unfolded = ics.text.replace(/\r\n /g, "");
    expect(unfolded).toContain("SUMMARY:Referee · Union Sportive\\, Douala\\; Est – Back\\\\slash FC");
    expect(icsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    const folded = icsFold(`SUMMARY:${"é".repeat(60)}`);
    expect(folded.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(folded.split("\r\n").slice(1).every((l) => l.startsWith(" "))).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe(`SUMMARY:${"é".repeat(60)}`);
  });

  it("is the caller's own: another referee gets theirs; no session 401; staff without a file 403", async () => {
    const other = await api("GET", "/api/v1/me/calendar.ics", { session: ref2 });
    expect([...other.text.matchAll(/^UID:(.+)$/gm)].map((m) => m[1].trim())).toEqual(["ic-fx1-AR1@aris"]);
    expect((await api("GET", "/api/v1/me/calendar.ics")).status).toBe(401);
    expect((await api("GET", "/api/v1/me/calendar.ics", { session: admin })).status).toBe(403);
  });
});
