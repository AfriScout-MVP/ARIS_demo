import { beforeEach, describe, expect, it } from "vitest";
import {
  addDays,
  applySnapshot,
  availabilityFor,
  crewIsComplete,
  currentSeason,
  daysBetween,
  eligibleNations,
  fixtureById,
  fixturesInWeek,
  mondayOf,
  openSlots,
  requiredRoles,
  resetStore,
  restDays,
  seasonOf,
  weekDates,
} from "@/lib/store";
import { crew, fixture, snapshot } from "./fixtures";

describe("date helpers", () => {
  it("adds days across month and leap-year boundaries", () => {
    expect(addDays("2028-02-28", 2)).toBe("2028-03-01");
    expect(addDays("2030-01-01", -1)).toBe("2029-12-31");
  });
  it("measures days between dates", () => {
    expect(daysBetween("2030-03-01", "2030-03-13")).toBe(12);
    expect(daysBetween("2030-03-13", "2030-03-01")).toBe(-12);
  });
  it("finds the Monday of a week, including for a Sunday", () => {
    expect(mondayOf("2030-03-13")).toBe("2030-03-11");
    expect(mondayOf("2030-03-17")).toBe("2030-03-11");
    expect(mondayOf("2030-03-11")).toBe("2030-03-11");
  });
  it("lists the seven dates of a week", () => {
    const dates = weekDates("2030-03-11");
    expect(dates).toHaveLength(7);
    expect(dates[6]).toBe("2030-03-17");
  });
  it("derives the season from the date (seasons start in August)", () => {
    expect(seasonOf("2030-03-13")).toBe("2029/30");
    expect(seasonOf("2030-08-01")).toBe("2030/31");
    expect(seasonOf("")).toBe("");
  });
});

describe("crews and coverage", () => {
  beforeEach(() => {
    resetStore();
    applySnapshot(
      snapshot({
        fixtures: [
          fixture("open", "AAA", "2030-03-12", { crew: crew(["R", "r1", "confirmed"], ["AR1", null, "empty"], ["AR2", "a1", "declined"], ["FOURTH", "a2", "pending"]) }),
          fixture("full", "AAA", "2030-03-13", { crew: crew(["R", "r1", "confirmed"], ["AR1", "a1", "pending"], ["OBS", null, "empty"]) }),
          fixture("next-week", "AAA", "2030-03-19"),
          fixture("tie", "CAF", "2030-03-14", { competitionId: "caf-x", importance: 90, homeCode: "AAA", awayCode: "BBB" }),
        ],
      }),
    );
  });

  it("counts the slots still to fill, ignoring the observer", () => {
    expect(openSlots(fixtureById.get("open")!)).toBe(2);
    expect(openSlots(fixtureById.get("full")!)).toBe(0);
  });

  it("calls a crew complete when every non-observer slot is confirmed or pending", () => {
    expect(crewIsComplete(fixtureById.get("open")!)).toBe(false);
    expect(crewIsComplete(fixtureById.get("full")!)).toBe(true);
  });

  it("selects the fixtures of one week", () => {
    expect(fixturesInWeek("2030-03-11").map((f) => f.id).sort()).toEqual(["full", "open", "tie"]);
    expect(fixturesInWeek("2030-03-18").map((f) => f.id)).toEqual(["next-week"]);
  });

  it("requires VAR roles only where the competition has VAR, and never the observer", () => {
    expect(requiredRoles(fixtureById.get("open")!)).toEqual(["R", "AR1", "AR2", "FOURTH"]);
    expect(requiredRoles(fixtureById.get("tie")!)).toEqual(["R", "AR1", "AR2", "FOURTH", "VAR", "AVAR"]);
  });

  it("limits a domestic fixture to its own country and a tie to neutral nations", () => {
    const domestic = eligibleNations(fixtureById.get("open")!);
    expect(domestic("AAA")).toBe(true);
    expect(domestic("BBB")).toBe(false);
    const tie = eligibleNations(fixtureById.get("tie")!);
    expect(tie("AAA")).toBe(false);
    expect(tie("BBB")).toBe(false);
    expect(tie("CCC")).toBe(true);
  });

  it("measures rest from the last appointment, and defaults to 14 days", () => {
    expect(restDays("r1", "2030-03-16")).toBe(3);
    expect(restDays("r1", "2030-03-12")).toBe(14);
    expect(restDays("nobody", "2030-03-16")).toBe(14);
  });

  it("shows an official as assigned on the day of a match", () => {
    expect(availabilityFor("r1", "2030-03-12")).toBe("assigned");
    expect(availabilityFor("r1", "2030-03-20")).toBe("available");
  });

  it("knows the season of today", () => {
    expect(currentSeason()).toBe("2029/30");
  });
});
