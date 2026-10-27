import { describe, expect, it } from "vitest";
import type { CompetitionRow } from "@/lib/api/competitions";
import {
  emptyCompetition,
  fromCompetition,
  hasNextSeason,
  isSeason,
  nextSeason,
  progress,
  rolloverBody,
  seasonOf,
  tiersFor,
  toCompetitionBody,
  toCompetitionPatch,
  validateCompetition,
} from "@/lib/competitions/forms";

const row = (over: Partial<CompetitionRow> = {}): CompetitionRow => ({
  id: "sen-l1", countryCode: "SEN", name: "Ligue 1", shortName: "L1", tier: "d1", gender: "M", season: "2026/2027",
  matchdays: 26, currentMatchday: 7, varEnabled: true, weight: 1.2, isActive: true, ...over,
});

describe("seasons", () => {
  it("names the season a date falls in (July onwards is the new one)", () => {
    expect(seasonOf("2026-10-23")).toBe("2026/2027");
    expect(seasonOf("2026-07-01")).toBe("2026/2027");
    expect(seasonOf("2026-06-30")).toBe("2025/2026");
  });
  it("checks and advances the YYYY/YYYY label", () => {
    expect(isSeason("2026/2027")).toBe(true);
    expect(isSeason("2026/2028")).toBe(false);
    expect(isSeason("2026-2027")).toBe(false);
    expect(nextSeason("2026/2027")).toBe("2027/2028");
  });
});

describe("validateCompetition", () => {
  it("accepts the defaults once named", () => {
    expect(validateCompetition({ ...emptyCompetition("SEN", "2026-10-23"), name: "Ligue 1" }, "SEN")).toEqual({});
  });
  it("keeps continental competitions to CAF and CAF to continental competitions", () => {
    expect(tiersFor("CAF")).toEqual(["continental"]);
    expect(emptyCompetition("CAF", "2026-10-23").tier).toBe("continental");
    const v = { ...emptyCompetition("SEN", "2026-10-23"), name: "X Cup", tier: "continental" as const };
    expect(validateCompetition(v, "SEN").tier).toBe("competitions.errors.tier");
  });
  it("applies the Worker's number rules", () => {
    const v = { ...emptyCompetition("SEN", "2026-10-23"), name: "L", season: "2026/2028", matchdays: "0", currentMatchday: "x", weight: "11" };
    expect(Object.keys(validateCompetition(v, "SEN")).sort()).toEqual(["currentMatchday", "matchdays", "name", "season", "weight"]);
    expect(validateCompetition({ ...v, name: "Ligue 1", season: "2026/2027", matchdays: "10", currentMatchday: "11", weight: "1,5" }, "SEN")).toEqual({
      currentMatchday: "competitions.errors.beyondLast",
    });
  });
});

describe("bodies", () => {
  it("turns the form into a request, a decimal comma included", () => {
    const body = toCompetitionBody({ ...emptyCompetition("SEN", "2026-10-23"), name: " Coupe ", shortName: "", tier: "cup", weight: "1,5" }, "SEN");
    expect(body).toMatchObject({ countryCode: "SEN", name: "Coupe", shortName: null, tier: "cup", season: "2026/2027", matchdays: 30, currentMatchday: 0, weight: 1.5 });
  });
  it("patches only what changed", () => {
    expect(toCompetitionPatch(fromCompetition(row()), row())).toEqual({});
    expect(toCompetitionPatch({ ...fromCompetition(row()), currentMatchday: "8", shortName: "", isActive: false }, row())).toEqual({ currentMatchday: 8, shortName: null, isActive: false });
  });
  it("carries a competition into the next season from matchday 0, once", () => {
    expect(rolloverBody(row())).toMatchObject({ season: "2027/2028", currentMatchday: 0, isActive: true, name: "Ligue 1", varEnabled: true, weight: 1.2 });
    expect(hasNextSeason(row(), [row()])).toBe(false);
    expect(hasNextSeason(row(), [row(), row({ id: "next", season: "2027/2028" })])).toBe(true);
    expect(hasNextSeason(row(), [row(), row({ id: "w", season: "2027/2028", gender: "W" })])).toBe(false);
  });
  it("measures progress through the season", () => {
    expect(progress(row())).toBe(27);
    expect(progress(row({ currentMatchday: 30 }))).toBe(100);
  });
});
