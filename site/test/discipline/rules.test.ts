import { describe, expect, it } from "vitest";
import type { DisciplinaryCase, Incident } from "@/lib/api/discipline";
import { caseActions, closingLiftsSuspension, disciplineSummary, matchesText, suspendedOn, validateDecision } from "@/lib/discipline/rules";

const kase = (over: Partial<DisciplinaryCase>): DisciplinaryCase => ({
  id: "c1", officialId: "o1", officialName: "Aïssatou", countryCode: "SEN", incidentId: null, status: "opened", summary: "Late",
  hearingAt: null, decision: null, decisionRef: null, sanction: null, suspensionFrom: null, suspensionTo: null, appealNote: null,
  openedAt: "2026-10-01T10:00:00Z", decidedAt: null, ...over,
});
const suspension = { sanction: "suspension" as const, status: "decided" as const, suspensionFrom: "2026-10-10", suspensionTo: "2026-10-20" };

describe("caseActions", () => {
  it("follows the Worker's guards", () => {
    expect(caseActions("opened")).toEqual(["hearing", "decide", "close"]);
    expect(caseActions("hearing_scheduled")).toEqual(["hearing", "decide", "close"]);
    expect(caseActions("decided")).toEqual(["appeal", "close"]);
    expect(caseActions("appealed")).toEqual(["decide", "close"]);
    expect(caseActions("closed")).toEqual([]);
  });
});

describe("suspensions", () => {
  it("are in force inside the window, while decided or under appeal", () => {
    expect(suspendedOn(kase(suspension), "2026-10-10")).toBe(true);
    expect(suspendedOn(kase(suspension), "2026-10-20")).toBe(true);
    expect(suspendedOn(kase(suspension), "2026-10-21")).toBe(false);
    expect(suspendedOn(kase({ ...suspension, status: "appealed" }), "2026-10-15")).toBe(true);
    expect(suspendedOn(kase({ ...suspension, status: "closed" }), "2026-10-15")).toBe(false);
    expect(suspendedOn(kase({ ...suspension, sanction: "warning" }), "2026-10-15")).toBe(false);
  });
  it("are lifted by a closure while running or still to come, which the dialog warns about", () => {
    expect(closingLiftsSuspension(kase(suspension), "2026-10-01")).toBe(true);
    expect(closingLiftsSuspension(kase(suspension), "2026-10-15")).toBe(true);
    expect(closingLiftsSuspension(kase(suspension), "2026-10-25")).toBe(false);
  });
});

describe("disciplineSummary", () => {
  const inc = (status: Incident["status"]) => ({ status }) as Incident;
  it("counts open reports, procedures under way, people suspended and hearings in the next two weeks", () => {
    const s = disciplineSummary(
      [inc("open"), inc("reviewing"), inc("closed")],
      [
        kase({ id: "a", status: "hearing_scheduled", hearingAt: "2026-10-12T09:00" }),
        kase({ id: "b", status: "hearing_scheduled", hearingAt: "2026-12-12T09:00" }),
        kase({ id: "c", ...suspension, officialId: "o2" }),
        kase({ id: "d", ...suspension, officialId: "o2", status: "appealed" }),
        kase({ id: "e", status: "closed" }),
      ],
      "2026-10-11",
    );
    expect(s).toEqual({ openIncidents: 2, activeCases: 3, suspended: 1, hearings: 1 });
  });
});

describe("validateDecision", () => {
  const base = { sanction: "warning" as const, decision: "Formal warning", decisionRef: "", from: "", to: "" };
  it("asks a suspension for its reference and a coherent window", () => {
    expect(validateDecision(base)).toEqual({});
    expect(validateDecision({ ...base, decision: "no" })).toEqual({ decision: true });
    expect(validateDecision({ ...base, sanction: "suspension" })).toEqual({ decisionRef: true, window: true });
    expect(validateDecision({ ...base, sanction: "suspension", decisionRef: "CD-14", from: "2026-10-10", to: "2026-10-01" })).toEqual({ window: true });
    expect(validateDecision({ ...base, sanction: "suspension", decisionRef: "CD-14", from: "2026-10-10", to: "2026-10-10" })).toEqual({});
  });
});

it("matchesText ignores accents and case", () => {
  expect(matchesText("aissatou", "Aïssatou Ndiaye")).toBe(true);
  expect(matchesText("", null)).toBe(true);
  expect(matchesText("x", null, "abc")).toBe(false);
});
