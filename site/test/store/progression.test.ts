import { beforeEach, describe, expect, it } from "vitest";
import { applySnapshot, licenceStatus, progressionFor, refereeById, resetStore } from "@/lib/store";
import { assessment, fitness, licence, referee, snapshot } from "./fixtures";

describe("licenceStatus", () => {
  beforeEach(() => {
    resetStore();
    applySnapshot(snapshot());
  });

  it("is measured from the API's today, not the browser's", () => {
    expect(licenceStatus(licence("l", "r1", "National D1", "2030-03-10"))).toEqual({ state: "expired", days: -3 });
    expect(licenceStatus(licence("l", "r1", "National D1", "2030-03-13"))).toEqual({ state: "expiring", days: 0 });
    expect(licenceStatus(licence("l", "r1", "National D1", "2030-06-11"))).toEqual({ state: "expiring", days: 90 });
    expect(licenceStatus(licence("l", "r1", "National D1", "2030-06-12")).state).toBe("valid");
  });
});

describe("progressionFor", () => {
  beforeEach(() => resetStore());

  it("lists every requirement as met for a ready referee", () => {
    applySnapshot(
      snapshot({
        referees: [referee("ready", "AAA", { level: "FIFA Listed", arps: 88, matches: 120 })],
        licences: [licence("v", "ready", "VAR Certification", "2031-01-01")],
        fitnessTests: [fitness("ready", true)],
        assessments: [assessment("1", "ready"), assessment("2", "ready"), assessment("3", "ready")],
      }),
    );
    const p = progressionFor(refereeById.get("ready")!);
    expect(p.nextLevel).toBe("CAF Elite");
    expect(p.requirements.map((r) => r.id)).toEqual(["arps", "fitness", "var", "observer", "matches"]);
    expect(p.requirements.every((r) => r.met)).toBe(true);
  });

  it("flags what is missing", () => {
    applySnapshot(
      snapshot({
        referees: [referee("weak", "AAA", { level: "Regional", arps: 70, matches: 10 })],
        fitnessTests: [fitness("weak", false)],
        assessments: [assessment("1", "weak"), assessment("2", "weak", "draft")],
      }),
    );
    const p = progressionFor(refereeById.get("weak")!);
    expect(p.nextLevel).toBe("National D1");
    expect(p.requirements.filter((r) => r.met)).toHaveLength(0);
    expect(p.requirements.find((r) => r.id === "observer")?.value).toBe("1/3");
  });

  it("does not need a fitness record to answer", () => {
    applySnapshot(snapshot());
    const p = progressionFor(refereeById.get("r1")!);
    expect(p.nextLevel).toBeNull();
    expect(p.requirements.find((r) => r.id === "fitness")?.met).toBe(false);
  });
});
