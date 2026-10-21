import { describe, expect, it } from "vitest";
import { formatRelative, parseTimestamp } from "@/lib/i18n/relative";

const NOW = Date.parse("2030-03-13T12:00:00Z");

describe("formatRelative", () => {
  it("reads zone-less and SQLite-style timestamps as UTC", () => {
    expect(parseTimestamp("2030-03-13 11:00:00")).toBe(Date.parse("2030-03-13T11:00:00Z"));
    expect(parseTimestamp("2030-03-13T11:00:00")).toBe(Date.parse("2030-03-13T11:00:00Z"));
    expect(parseTimestamp("2030-03-13T13:00:00+02:00")).toBe(Date.parse("2030-03-13T11:00:00Z"));
  });

  it("speaks the active language through Intl", () => {
    const fiveMin = "2030-03-13T11:55:00Z";
    expect(formatRelative(fiveMin, "en", NOW)).toMatch(/5/);
    expect(formatRelative(fiveMin, "fr", NOW)).toMatch(/il y a/);
    expect(formatRelative(fiveMin, "de", NOW)).toMatch(/vor/);
    expect(formatRelative(fiveMin, "es", NOW)).toMatch(/hace/);
  });

  it("steps up through minutes, hours and days", () => {
    expect(formatRelative("2030-03-13T09:00:00Z", "en", NOW)).toMatch(/3/);
    expect(formatRelative("2030-03-11T12:00:00Z", "en", NOW)).toMatch(/2/);
  });

  it("returns an empty string for rubbish", () => {
    expect(formatRelative("not a date", "en", NOW)).toBe("");
  });
});
