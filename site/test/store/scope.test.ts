import { describe, expect, it } from "vitest";
import { codesFor, parseScope, serialiseScope } from "@/lib/scope/scope";

const known = [
  { code: "AAA", zone: "UNAF" as const },
  { code: "BBB", zone: "UNAF" as const },
  { code: "CCC", zone: "COSAFA" as const },
];

describe("scope", () => {
  it("round-trips through its stored form", () => {
    for (const raw of ["all", "zone:UNAF", "country:CCC"]) {
      expect(serialiseScope(parseScope(raw, known))).toBe(raw);
    }
  });

  it("falls back to all for anything the loaded countries do not know", () => {
    expect(parseScope("country:ZZZ", known)).toEqual({ kind: "all" });
    expect(parseScope("zone:CECAFA", known)).toEqual({ kind: "all" });
    expect(parseScope(null, known)).toEqual({ kind: "all" });
    expect(parseScope("country:AAA", [])).toEqual({ kind: "all" });
  });

  it("lists the countries a scope covers", () => {
    expect(codesFor({ kind: "all" }, known)).toEqual(["AAA", "BBB", "CCC"]);
    expect(codesFor({ kind: "zone", zone: "UNAF" }, known)).toEqual(["AAA", "BBB"]);
    expect(codesFor({ kind: "country", code: "CCC" }, known)).toEqual(["CCC"]);
  });
});
