import { describe, expect, it } from "vitest";
import { locales } from "@/locales";
import { flat, placeholders } from "./helpers";

const source = flat("fr");
const others = locales.filter((l) => l !== "fr");

describe("translation parity against fr (the source of truth)", () => {
  it("fr itself is non-trivial", () => {
    expect(Object.keys(source).length).toBeGreaterThan(500);
  });

  describe.each(others)("%s", (locale) => {
    const target = flat(locale);

    it("has exactly the same key set as fr", () => {
      const missing = Object.keys(source).filter((k) => !(k in target));
      const extra = Object.keys(target).filter((k) => !(k in source));
      expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    });

    it("has no empty or whitespace-only strings", () => {
      const empty = Object.entries(target)
        .filter(([, v]) => v.trim() === "")
        .map(([k]) => k);
      expect(empty).toEqual([]);
    });

    it("uses the same {placeholders} as fr for every key", () => {
      const mismatched = Object.keys(source)
        .filter((k) => k in target)
        .filter((k) => placeholders(source[k]).join() !== placeholders(target[k]).join())
        .map((k) => ({ key: k, fr: source[k], [locale]: target[k] }));
      expect(mismatched).toEqual([]);
    });

    it("has no leftover template debris (unbalanced braces, stray whitespace)", () => {
      const bad = Object.entries(target)
        .filter(([, v]) => (v.match(/\{/g) ?? []).length !== (v.match(/\}/g) ?? []).length || v !== v.trim())
        .map(([k]) => k);
      expect(bad).toEqual([]);
    });
  });

  it("fr has no empty strings either", () => {
    expect(Object.entries(source).filter(([, v]) => v.trim() === "")).toEqual([]);
  });

  it("product names stay untranslated where they appear", () => {
    for (const locale of locales) {
      const t = flat(locale);
      expect(t["common.appName"]).toBe("ARIS");
      expect(t["common.by"]).toContain("Prestige Solutions of Afrika");
      expect(t["overview.kpiArps"]).toContain("ARPS");
      expect(t["nav.role"]).toContain("CAF");
      expect(t["roles.AVAR"]).toContain("VAR");
    }
  });
});
