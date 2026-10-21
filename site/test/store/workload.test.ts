import { beforeEach, describe, expect, it } from "vitest";
import { applySnapshot, resetStore, workloadFor, WORKLOAD_HEAVY } from "@/lib/store";
import { crew, fixture, snapshot } from "./fixtures";

beforeEach(() => {
  resetStore();
  applySnapshot(
    snapshot({
      fixtures: [
        fixture("past", "AAA", "2030-03-08", { played: true, crew: crew(["R", "r1", "confirmed"], ["AR1", "a1", "confirmed"]) }),
        fixture("soon", "AAA", "2030-03-15", { crew: crew(["R", "r1", "pending"], ["AR1", "a1", "confirmed"], ["AR2", null, "empty"]) }),
        fixture("later", "AAA", "2030-03-20", { crew: crew(["R", "r2", "declined"]) }),
      ],
    }),
  );
});

describe("workloadFor", () => {
  it("counts appointments per official, most loaded first", () => {
    const rows = workloadFor(["AAA"]);
    const r1 = rows.find((r) => r.officialId === "r1")!;
    expect(r1).toMatchObject({ appointments: 2, asReferee: 2, lastDate: "2030-03-08", nextInDays: 2 });
    expect(rows[0].appointments).toBeGreaterThanOrEqual(rows[rows.length - 1].appointments);
  });

  it("counts a declined slot (the official was designated) but not an empty one", () => {
    const rows = workloadFor(["AAA"]);
    expect(rows.find((r) => r.officialId === "r2")?.appointments).toBe(1);
  });

  it("lists officials with nothing booked as idle", () => {
    const rows = workloadFor(["AAA", "BBB"]);
    const idle = rows.filter((r) => r.appointments === 0).map((r) => r.officialId);
    expect(idle).toEqual(expect.arrayContaining(["r3", "a2"]));
    expect(rows.find((r) => r.officialId === "r3")?.nextInDays).toBeNull();
  });

  it("only covers the countries in scope", () => {
    expect(workloadFor(["BBB"]).every((r) => r.countryCode === "BBB")).toBe(true);
  });

  it("flags heavy use from a fixed threshold", () => {
    expect(WORKLOAD_HEAVY).toBeGreaterThan(1);
  });
});
