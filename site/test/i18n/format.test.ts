import { describe, expect, it } from "vitest";
import { locales, localeTags } from "@/locales";
import { makeFormatters } from "@/lib/i18n/translate";

describe("makeFormatters", () => {
  it("formats the same ISO day differently per locale", () => {
    const month = Object.fromEntries(locales.map((l) => [l, makeFormatters(l).longDate("2026-03-14")]));
    expect(month.fr).toMatch(/mars/);
    expect(month.en).toMatch(/March/);
    expect(month.es).toMatch(/marzo/);
    expect(month.de).toMatch(/März/);
  });

  it("formats weekday and short date without throwing", () => {
    for (const l of locales) {
      const f = makeFormatters(l);
      expect(f.weekday("2026-03-14").length).toBeGreaterThan(1);
      expect(f.date("2026-03-14")).toContain("14");
    }
  });

  it("formats numbers with the locale's own separators", () => {
    expect(makeFormatters("en").number(1234567.5)).toBe((1234567.5).toLocaleString(localeTags.en));
    expect(makeFormatters("de").number(1234567.5)).toContain("1.234.567,5");
    expect(makeFormatters("en").number(1234567.5)).toContain("1,234,567.5");
  });
});
