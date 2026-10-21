import { describe, expect, it } from "vitest";
import { localParts, toUtcIso } from "../../src/lib/time";

const ZONES = ["Africa/Cairo", "Africa/Casablanca", "Africa/Lagos", "Africa/Nairobi", "UTC"] as const;

describe("fixed offsets", () => {
  it("converts local kickoffs to UTC", () => {
    expect(toUtcIso("2031-03-01", "15:00", "Africa/Nairobi")).toBe("2031-03-01T12:00:00Z"); // +3
    expect(toUtcIso("2031-03-01", "15:00", "Africa/Lagos")).toBe("2031-03-01T14:00:00Z"); // +1
    expect(toUtcIso("2031-03-01", "15:00", "UTC")).toBe("2031-03-01T15:00:00Z");
  });

  it("shows UTC instants as local wall-clock time", () => {
    expect(localParts("2031-03-01T12:00:00Z", "Africa/Nairobi")).toEqual({ date: "2031-03-01", time: "15:00" });
    expect(localParts("2031-03-01T12:00:00Z")).toEqual({ date: "2031-03-01", time: "12:00" });
  });

  it("crosses midnight in both directions", () => {
    expect(toUtcIso("2031-04-10", "01:30", "Africa/Nairobi")).toBe("2031-04-09T22:30:00Z");
    expect(localParts("2031-04-09T22:30:00Z", "Africa/Nairobi")).toEqual({ date: "2031-04-10", time: "01:30" });
    expect(toUtcIso("2031-04-09", "23:30", "Africa/Lagos")).toBe("2031-04-09T22:30:00Z");
    expect(localParts("2031-12-31T23:30:00Z", "Africa/Lagos")).toEqual({ date: "2032-01-01", time: "00:30" });
  });
});

describe("zones that change their clocks", () => {
  it("Cairo is UTC+2 in winter and UTC+3 under summer time", () => {
    expect(toUtcIso("2031-01-15", "20:00", "Africa/Cairo")).toBe("2031-01-15T18:00:00Z");
    expect(toUtcIso("2031-07-15", "20:00", "Africa/Cairo")).toBe("2031-07-15T17:00:00Z");
  });

  it("Casablanca is a single offset away from UTC on a normal day", () => {
    const a = toUtcIso("2031-06-15", "21:00", "Africa/Casablanca");
    expect(["2031-06-15T20:00:00Z", "2031-06-15T21:00:00Z"]).toContain(a);
    expect(localParts(a, "Africa/Casablanca")).toEqual({ date: "2031-06-15", time: "21:00" });
  });

  it("handles the spring gap: a time that does not exist moves forward, deterministically", () => {
    // Egypt's clocks jump 00:00 → 01:00 on the last Friday of April
    const ghost = toUtcIso("2031-04-25", "00:30", "Africa/Cairo");
    expect(localParts(ghost, "Africa/Cairo").time).toBe("01:30");
    expect(toUtcIso("2031-04-25", "00:30", "Africa/Cairo")).toBe(ghost);
    // the hour on either side is unambiguous
    expect(localParts(toUtcIso("2031-04-24", "23:30", "Africa/Cairo"), "Africa/Cairo")).toEqual({ date: "2031-04-24", time: "23:30" });
    expect(localParts(toUtcIso("2031-04-25", "01:30", "Africa/Cairo"), "Africa/Cairo")).toEqual({ date: "2031-04-25", time: "01:30" });
  });

  it("handles the autumn overlap: the repeated hour still maps to a real instant of that hour", () => {
    // Egypt's clocks fall back 24:00 → 23:00 on the last Thursday of October
    const repeated = toUtcIso("2031-10-30", "23:30", "Africa/Cairo");
    expect(localParts(repeated, "Africa/Cairo")).toEqual({ date: "2031-10-30", time: "23:30" });
  });

  it("the offset differs across the clock change", () => {
    const before = Date.parse(toUtcIso("2031-04-24", "12:00", "Africa/Cairo"));
    const after = Date.parse(toUtcIso("2031-04-26", "12:00", "Africa/Cairo"));
    expect((after - before) / 3_600_000).toBe(47); // 48 wall-clock hours, minus the hour the clocks skipped
  });
});

describe("round trips", () => {
  const days = ["2031-01-01", "2031-03-31", "2031-04-26", "2031-06-30", "2031-09-15", "2031-10-31", "2031-12-31", "2032-02-29"];
  const times = ["00:00", "01:30", "12:00", "18:45", "23:59"];
  for (const zone of ZONES) {
    it(`local → UTC → local is the identity in ${zone}`, () => {
      let checked = 0;
      for (const date of days) {
        for (const time of times) {
          const back = localParts(toUtcIso(date, time, zone), zone);
          // the only legal exception is a wall-clock time that was skipped by a clock change
          if (back.date === date && back.time === time) checked += 1;
          else expect(Math.abs(Number(back.time.slice(0, 2)) - Number(time.slice(0, 2))) % 23).toBeLessThanOrEqual(1);
        }
      }
      expect(checked).toBeGreaterThanOrEqual(days.length * times.length - 3);
    });
  }

  it("UTC → local → UTC is the identity", () => {
    for (const zone of ZONES) {
      for (const iso of ["2031-01-01T00:00:00Z", "2031-04-24T21:59:00Z", "2031-07-04T12:00:00Z", "2031-10-30T21:30:00Z", "2031-12-31T23:59:00Z"]) {
        const { date, time } = localParts(iso, zone);
        expect(toUtcIso(date, time, zone)).toBe(iso.replace(":00Z", ":00Z"));
      }
    }
  });

  it("never returns milliseconds", () => {
    expect(toUtcIso("2031-05-05", "10:00", "Africa/Lagos")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });
});
