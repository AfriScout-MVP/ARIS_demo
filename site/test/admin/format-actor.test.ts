import { describe, expect, it } from "vitest";
import { canManageUser, creatableRoles, isSelf, toActor } from "@/lib/admin/actor";
import { formatDateTime, initials, parseTimestamp } from "@/lib/admin/format";

describe("toActor", () => {
  it("reads the session user defensively", () => {
    expect(toActor(null)).toBeNull();
    expect(toActor("x")).toBeNull();
    expect(toActor({ id: "1", role: "federation", country: "MAR", federationId: "f1", federationCode: "FRMF" })).toEqual({
      id: "1", role: "federation", country: "MAR", federationId: "f1", federationCode: "FRMF",
    });
    expect(toActor({ id: "2", role: "commission" })?.role).toBeNull();
    expect(toActor({ id: "3", role: "admin" })).toMatchObject({ role: "admin", country: null });
  });
});

describe("what each role may do", () => {
  const admin = toActor({ id: "a", role: "admin" });
  const seat = toActor({ id: "s", role: "federation", country: "MAR", federationId: "f1" });
  const referee = toActor({ id: "r", role: "referee" });
  const mine = { id: "x", role: "referee", country: "MAR" };
  const theirs = { id: "y", role: "referee", country: "EGY" };
  const aSeat = { id: "z", role: "federation", country: "MAR" };

  it("the admin creates any role, a seat only referees, a referee nothing", () => {
    expect(creatableRoles(admin)).toEqual(["admin", "federation", "referee", "tagger"]);
    expect(creatableRoles(seat)).toEqual(["referee"]);
    expect(creatableRoles(referee)).toEqual([]);
    expect(creatableRoles(null)).toEqual([]);
  });
  it("a seat manages only the referees of its own country, never seats", () => {
    expect(canManageUser(seat, mine)).toBe(true);
    expect(canManageUser(seat, theirs)).toBe(false);
    expect(canManageUser(seat, aSeat)).toBe(false);
    expect(canManageUser(seat, { id: "q", role: "referee", country: null })).toBe(false);
  });
  it("the admin manages everybody; a referee nobody", () => {
    for (const target of [mine, theirs, aSeat]) expect(canManageUser(admin, target)).toBe(true);
    expect(canManageUser(referee, mine)).toBe(false);
    expect(canManageUser(null, mine)).toBe(false);
  });
  it("knows itself", () => {
    expect(isSelf(admin, "a")).toBe(true);
    expect(isSelf(admin, "b")).toBe(false);
    expect(isSelf(null, "a")).toBe(false);
  });
});

describe("timestamps", () => {
  it("reads ISO and SQLite forms as UTC", () => {
    expect(parseTimestamp("2026-05-01T09:30:00.000Z")?.toISOString()).toBe("2026-05-01T09:30:00.000Z");
    expect(parseTimestamp("2026-05-01 09:30:00")?.toISOString()).toBe("2026-05-01T09:30:00.000Z");
    expect(parseTimestamp("2026-05-01T09:30:00+02:00")?.toISOString()).toBe("2026-05-01T07:30:00.000Z");
  });
  it("returns null / a dash for nothing or nonsense", () => {
    expect(parseTimestamp(null)).toBeNull();
    expect(parseTimestamp("not a date")).toBeNull();
    expect(formatDateTime(null, "fr-FR")).toBe("—");
    expect(formatDateTime("garbage", "fr-FR")).toBe("—");
  });
  it("formats in the visitor's language", () => {
    expect(formatDateTime("2026-05-01 09:30:00", "en-GB")).toContain("2026");
    expect(formatDateTime("2026-05-01 09:30:00", "fr-FR")).toMatch(/mai/);
  });
});

describe("initials", () => {
  it("takes the first letters of the first two words", () => {
    expect(initials("Nadia Boukhari")).toBe("NB");
    expect(initials("  omar  ben ali ")).toBe("OB");
    expect(initials("")).toBe("");
  });
});
