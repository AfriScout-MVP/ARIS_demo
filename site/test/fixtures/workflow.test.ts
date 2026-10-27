import { describe, expect, it } from "vitest";
import type { CrewSlot } from "@/lib/store/types";
import { canRecordResult, nextStep, parseScore, reasonNeeded, requiredSlots, validateFixture, type FixtureValues } from "@/lib/fixtures/workflow";

const slot = (role: CrewSlot["role"], state: CrewSlot["state"] = "confirmed", officialId: string | null = `o-${role}`): CrewSlot => ({ role, state, officialId });
const full = (state: CrewSlot["state"] = "confirmed"): CrewSlot[] => [slot("R", state), slot("AR1", state), slot("AR2", state), slot("FOURTH", state)];
const scheduled = { status: "scheduled" as const, played: false };

describe("requiredSlots", () => {
  it("leaves the observer out", () => {
    expect(requiredSlots([...full(), slot("OBS", "empty", null)]).map((s) => s.role)).toEqual(["R", "AR1", "AR2", "FOURTH"]);
  });
});

describe("nextStep", () => {
  it("offers submit on a draft and blocks it while a required slot is open", () => {
    expect(nextStep({ ...scheduled, designationStatus: "draft" }, full("pending"))).toEqual({ step: "submit", blocked: null });
    const open = [...full("pending").slice(0, 3), slot("FOURTH", "empty", null)];
    expect(nextStep({ ...scheduled, designationStatus: "draft" }, open)).toEqual({ step: "submit", blocked: "fixtures.blocked.incomplete" });
    const declined = [...full("pending").slice(0, 3), slot("FOURTH", "declined")];
    expect(nextStep({ ...scheduled, designationStatus: "draft" }, declined).blocked).toBe("fixtures.blocked.incomplete");
  });

  it("does not wait on an empty observer slot", () => {
    expect(nextStep({ ...scheduled, designationStatus: "draft" }, [...full("pending"), slot("OBS", "empty", null)]).blocked).toBeNull();
    expect(nextStep({ ...scheduled, designationStatus: "awaiting_confirmation" }, [...full(), slot("OBS", "pending")]).blocked).toBeNull();
  });

  it("validates only once every required official has confirmed", () => {
    const mixed = [...full().slice(0, 3), slot("FOURTH", "pending")];
    expect(nextStep({ ...scheduled, designationStatus: "awaiting_confirmation" }, mixed)).toEqual({ step: "validate", blocked: "fixtures.blocked.unconfirmed" });
    expect(nextStep({ ...scheduled, designationStatus: "awaiting_confirmation" }, full())).toEqual({ step: "validate", blocked: null });
  });

  it("publishes a validated crew and stops at published", () => {
    expect(nextStep({ ...scheduled, designationStatus: "validated" }, full()).step).toBe("publish");
    expect(nextStep({ ...scheduled, designationStatus: "published" }, full()).step).toBeNull();
  });

  it("offers nothing on a played, postponed or cancelled match", () => {
    expect(nextStep({ status: "scheduled", played: true, designationStatus: "draft" }, full()).step).toBeNull();
    expect(nextStep({ status: "postponed", played: false, designationStatus: "draft" }, full()).step).toBeNull();
    expect(nextStep({ status: "cancelled", played: false, designationStatus: "validated" }, full()).step).toBeNull();
  });
});

describe("canRecordResult", () => {
  const now = new Date("2026-10-20T18:00:00Z");
  it("needs kick-off passed and a referee who has not declined", () => {
    expect(canRecordResult({ ...scheduled, kickoffAt: "2026-10-20T16:00:00Z" }, full(), now)).toBe(true);
    expect(canRecordResult({ ...scheduled, kickoffAt: "2026-10-21T16:00:00Z" }, full(), now)).toBe(false);
    expect(canRecordResult({ ...scheduled, kickoffAt: "2026-10-20T16:00:00Z" }, [slot("R", "empty", null)], now)).toBe(false);
    expect(canRecordResult({ ...scheduled, kickoffAt: "2026-10-20T16:00:00Z" }, [slot("R", "declined")], now)).toBe(false);
  });
  it("refuses a played or closed match", () => {
    expect(canRecordResult({ status: "scheduled", played: true, kickoffAt: "2026-10-20T16:00:00Z" }, full(), now)).toBe(false);
    expect(canRecordResult({ status: "postponed", played: false, kickoffAt: "2026-10-20T16:00:00Z" }, full(), now)).toBe(false);
  });
});

describe("reasonNeeded", () => {
  it("asks for a reason when closing a match that has officials", () => {
    expect(reasonNeeded({ designationStatus: "draft" }, full("pending"), { closing: true, rescheduled: false })).toBe(true);
    expect(reasonNeeded({ designationStatus: "draft" }, [slot("R", "empty", null)], { closing: true, rescheduled: false })).toBe(false);
  });
  it("asks when moving a validated crew or one with a confirmation", () => {
    expect(reasonNeeded({ designationStatus: "validated" }, full(), { closing: false, rescheduled: true })).toBe(true);
    expect(reasonNeeded({ designationStatus: "draft" }, [slot("R", "confirmed"), slot("AR1", "pending")], { closing: false, rescheduled: true })).toBe(true);
    expect(reasonNeeded({ designationStatus: "draft" }, full("pending"), { closing: false, rescheduled: true })).toBe(false);
    expect(reasonNeeded({ designationStatus: "published" }, full(), { closing: false, rescheduled: false })).toBe(false);
  });
});

describe("validateFixture", () => {
  const ok: FixtureValues = { competitionId: "sen-l1", round: "8", roundLabel: "", homeTeamId: "t1", awayTeamId: "t2", stadiumId: "", date: "2026-11-02", time: "16:30", importance: "60" };
  it("accepts a complete fixture", () => {
    expect(validateFixture(ok, { creating: true })).toEqual({});
  });
  it("flags each field it can check", () => {
    expect(validateFixture({ ...ok, competitionId: "", homeTeamId: "", awayTeamId: "" }, { creating: true })).toEqual({
      competitionId: "fixtures.errors.competition",
      homeTeamId: "fixtures.errors.team",
      awayTeamId: "fixtures.errors.team",
    });
    expect(validateFixture({ ...ok, awayTeamId: "t1" }, { creating: true }).awayTeamId).toBe("fixtures.errors.sameTeam");
    const bad = validateFixture({ ...ok, round: "0", roundLabel: "x".repeat(61), date: "02/11/2026", time: "24:00", importance: "101" }, { creating: true });
    expect(Object.keys(bad).sort()).toEqual(["date", "importance", "round", "roundLabel", "time"]);
    expect(validateFixture({ ...ok, round: "101" }, { creating: true }).round).toBe("fixtures.errors.round");
  });
  it("does not re-check teams and competition on an edit, which cannot change them", () => {
    expect(validateFixture({ ...ok, competitionId: "", homeTeamId: "", awayTeamId: "" }, { creating: false })).toEqual({});
  });
});

describe("parseScore", () => {
  it("reads the usual ways of writing a score", () => {
    expect(parseScore("2-1")).toEqual([2, 1]);
    expect(parseScore(" 2 : 1 ")).toEqual([2, 1]);
    expect(parseScore("0–0")).toEqual([0, 0]);
    expect(parseScore("10-3")).toEqual([10, 3]);
  });
  it("rejects anything else", () => {
    for (const s of ["", "2", "2-", "-1", "a-b", "100-1", "2-1-0"]) expect(parseScore(s)).toBeNull();
  });
});
