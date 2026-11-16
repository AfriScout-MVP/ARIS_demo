import { describe, expect, it } from "vitest";
import { taggerMayReach } from "../../src/lib/access";
import { addFederationSeat, addUser, api, login } from "../helpers";

describe("a tagger reaches only the tagging routes", async () => {
  const seat = await addFederationSeat("TRG");
  await addUser("tr-tagger@aris.test", "tagger", { federationId: seat.federationId });
  const tagger = await login("tr-tagger@aris.test");
  const fed = await login(seat.email);

  // reference lists a federation seat reads but the tagging screen never needs
  const closed = ["/api/v1/courses", "/api/v1/evaluation-criteria", "/api/v1/competitions", "/api/v1/officials", "/api/v1/fixtures", "/api/v1/payments", "/api/v1/audit", "/api/v1/snapshot"];

  it.each(closed)("answers 403 on GET %s", async (path) => {
    const res = await api("GET", path, { session: tagger });
    expect([res.status, res.json.error?.code]).toEqual([403, "forbidden"]);
  });

  it("still lets a federation seat read the same lists", async () => {
    for (const path of ["/api/v1/courses", "/api/v1/evaluation-criteria", "/api/v1/competitions"]) {
      expect((await api("GET", path, { session: fed })).status).toBe(200);
    }
  });

  it("keeps the routes the tagging screen uses open", async () => {
    for (const path of ["/api/v1/auth/me", "/api/v1/notifications", "/api/v1/matches", "/api/v1/matches/event-types"]) {
      const res = await api("GET", path, { session: tagger });
      expect([path, res.status]).toEqual([path, 200]);
    }
  });

  it("states the allowlist exactly", () => {
    expect(taggerMayReach("GET", "/matches")).toBe(true);
    expect(taggerMayReach("GET", "/matches/event-types")).toBe(true);
    expect(taggerMayReach("GET", "/matches/m1")).toBe(true);
    expect(taggerMayReach("POST", "/matches/m1/decisions")).toBe(true);
    expect(taggerMayReach("DELETE", "/matches/m1/decisions/d1")).toBe(true);
    expect(taggerMayReach("GET", "/notifications")).toBe(true);
    expect(taggerMayReach("POST", "/notifications/n1/read")).toBe(true);
    expect(taggerMayReach("POST", "/matches/m1/officiating")).toBe(false);
    expect(taggerMayReach("DELETE", "/matches/m1")).toBe(false);
    expect(taggerMayReach("GET", "/matches/m1/anything")).toBe(false);
    expect(taggerMayReach("GET", "/courses")).toBe(false);
  });
});
