import { describe, expect, it } from "vitest";
import { makeFormatters } from "@/lib/i18n/translate";

describe("date formatters", () => {
  const fmt = makeFormatters("fr");

  it("never print 'Invalid Date'", () => {
    for (const bad of ["1987-08--19", "", "not a date", "1990-02-31x"]) {
      expect(fmt.date(bad)).toBe("");
      expect(fmt.fullDate(bad)).toBe("");
      expect(fmt.longDate(bad)).toBe("");
      expect(fmt.weekday(bad)).toBe("");
    }
    expect(fmt.month("2026-xx")).toBe("");
  });

  it("formats real dates, with the year where asked", () => {
    expect(fmt.fullDate("1987-08-19")).toBe("19 août 1987");
    expect(fmt.date("2026-11-15")).toMatch(/15 nov/);
    expect(fmt.month("2026-03")).toMatch(/mars/);
  });
});
