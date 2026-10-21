import { beforeEach, describe, expect, it } from "vitest";
import {
  applySnapshot,
  arpsTrend,
  assistantById,
  availabilityFor,
  competitionById,
  countries,
  countryByCode,
  countryFlagUrl,
  countryName,
  decisionsBreakdown,
  fixtureById,
  fixtureNations,
  fixtures,
  matchById,
  matches,
  officialById,
  refereeById,
  referees,
  resetStore,
  today,
  weekStarts,
} from "@/lib/store";
import { crew, fixture, referee, snapshot, TODAY } from "./fixtures";

describe("the store before any snapshot", () => {
  it("holds no data at all", () => {
    resetStore();
    expect(countries).toHaveLength(0);
    expect(referees).toHaveLength(0);
    expect(fixtures).toHaveLength(0);
    expect(matches).toHaveLength(0);
    expect(today()).toBe("");
    expect(weekStarts()).toEqual([]);
  });
});

describe("applySnapshot", () => {
  beforeEach(() => resetStore());

  it("fills the collections and their lookup maps", () => {
    applySnapshot(snapshot());
    expect(countries.map((c) => c.code)).toEqual(["AAA", "BBB"]);
    expect(countryByCode.get("BBB")?.zone).toBe("COSAFA");
    expect(competitionById.get("caf-x")?.tier).toBe("continental");
    expect(refereeById.get("r3")?.name).toBe("Ref r3");
    expect(assistantById.get("a2")?.countryCode).toBe("BBB");
    expect(officialById("a1")?.kind).toBe("assistant");
    expect(officialById("r1")?.kind).toBe("referee");
    expect(officialById("nobody")).toBeUndefined();
  });

  it("takes today and the three calendar weeks from the snapshot", () => {
    applySnapshot(snapshot());
    expect(today()).toBe(TODAY);
    expect(weekStarts()).toEqual(["2030-03-04", "2030-03-11", "2030-03-18"]);
  });

  it("replaces, not appends, on a second snapshot", () => {
    applySnapshot(snapshot());
    applySnapshot(snapshot({ referees: [referee("only", "AAA")] }));
    expect(referees.map((r) => r.id)).toEqual(["only"]);
    expect(refereeById.has("r1")).toBe(false);
  });

  it("sorts fixtures by date, then by importance", () => {
    applySnapshot(
      snapshot({
        fixtures: [
          fixture("late", "AAA", "2030-03-15", { importance: 90 }),
          fixture("early-low", "AAA", "2030-03-12", { importance: 10 }),
          fixture("early-high", "AAA", "2030-03-12", { importance: 80 }),
        ],
      }),
    );
    expect(fixtures.map((f) => f.id)).toEqual(["early-high", "early-low", "late"]);
    expect(fixtureById.get("late")?.importance).toBe(90);
  });

  it("fills in the workflow fields an older response leaves out", () => {
    applySnapshot(snapshot({ fixtures: [fixture("f1", "AAA", "2030-03-12"), fixture("f2", "AAA", "2030-03-01", { played: true })] }));
    expect(fixtureById.get("f1")).toMatchObject({ status: "scheduled", designationStatus: "draft", homeCode: null, kickoffAt: "" });
    expect(fixtureById.get("f2")?.status).toBe("played");
  });

  it("records the nations of a continental tie for the neutrality check", () => {
    applySnapshot(snapshot({ fixtures: [fixture("tie", "CAF", "2030-03-12", { homeCode: "AAA", awayCode: "BBB" })] }));
    expect(fixtureNations.get("tie")).toEqual(["AAA", "BBB"]);
  });

  it("reads declared availability, and nothing is invented for other days", () => {
    applySnapshot(snapshot({ availability: [{ officialId: "r1", date: "2030-03-14", state: "unavailable" }] }));
    expect(availabilityFor("r1", "2030-03-14")).toBe("unavailable");
    expect(availabilityFor("r1", "2030-03-15")).toBe("available");
  });

  it("defaults missing media and heat points", () => {
    applySnapshot(
      snapshot({
        matches: [
          {
            id: "m1", home: "H", away: "A", competitionId: "aaa-d1", countryCode: "AAA", date: "2030-03-01", score: "1–0",
            homeScore: 1, awayScore: 0, status: "played", season: "2029/30", refereeId: "r1", arpsForMatch: 80, rmcs: 80, pressureAvg: 50, decisions: [],
          },
        ],
      }),
    );
    expect(countryFlagUrl("AAA")).toBeNull();
    expect(countryFlagUrl("BBB")).toBe("/api/v1/media/flag-b");
    expect(refereeById.get("r1")?.photoUrl).toBeNull();
    expect(matchById.get("m1")?.heatPoints).toEqual([]);
    expect(matchById.get("m1")?.pressureTimeline).toEqual([]);
  });

  it("keeps the analytics series the API computed", () => {
    applySnapshot(
      snapshot({
        analytics: {
          arpsTrend: [{ month: "2030-01", score: 80 }, { month: "2030-02", score: 82 }],
          decisionsBreakdown: [{ id: "correct", value: 90 }, { id: "overturned", value: 10 }],
        },
      }),
    );
    expect(arpsTrend).toHaveLength(2);
    expect(decisionsBreakdown.map((d) => d.id)).toEqual(["correct", "overturned"]);
  });

  it("names countries in each of the four languages, falling back to English", () => {
    applySnapshot(snapshot());
    expect(countryName("AAA", "fr")).toBe("AAA pays");
    expect(countryName("AAA", "en")).toBe("AAA land");
    expect(countryName("AAA", "es")).toBe("AAA país");
    expect(countryName("AAA", "de")).toBe("AAA Land");
    expect(countryName("ZZZ", "fr")).toBe("ZZZ");
    expect(countryName("CAF", "en")).not.toBe("CAF");
  });

  it("keeps crews as sent", () => {
    applySnapshot(snapshot({ fixtures: [fixture("f", "AAA", "2030-03-12", { crew: crew(["R", "r1", "confirmed"]) })] }));
    expect(fixtureById.get("f")?.crew[0].officialId).toBe("r1");
  });
});
