import { describe, expect, it } from "vitest";
import { ageOf } from "../../src/domain/mappers";

describe("ageOf", () => {
  const now = new Date("2026-11-16T10:00:00Z");

  it("counts whole years, not yet a year older before the birthday", () => {
    expect(ageOf("1987-11-16", now)).toBe(39);
    expect(ageOf("1987-11-17", now)).toBe(38);
  });

  it("is 0 (unknown) when there is no birth date", () => expect(ageOf(null, now)).toBe(0));

  it("is 0, never NaN, for a date that cannot be read (JSON would turn NaN into null)", () => {
    for (const bad of ["1987-08--19", "not a date", "1990-13-45"]) {
      const age = ageOf(bad, now);
      expect(Number.isNaN(age), bad).toBe(false);
      expect(age, bad).toBe(0);
    }
  });
});
