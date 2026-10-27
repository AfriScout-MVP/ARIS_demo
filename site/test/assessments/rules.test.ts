import { describe, expect, it } from "vitest";
import type { MatchRow } from "@/lib/api/assessments";
import { clipsFor, isLate, marksOf, notesFor, observerDuties, parseMark, validateReport, valuesFrom, weightedOverall } from "@/lib/assessments/rules";

const grid = [
  { key: "positioning", label: { fr: "Placement", en: "Positioning" }, weight: 60 },
  { key: "decisions", label: { fr: "Décisions", en: "Decisions" }, weight: 40 },
];
const match = (over: Partial<MatchRow>): MatchRow => ({
  id: "m1", fixtureId: "f1", home: "A", away: "B", competitionId: "c", countryCode: "SEN", date: "2026-10-20", venue: null, status: "finished", score: "1-0", refereeId: "ref", ...over,
});

describe("marks", () => {
  it("reads 0–10 with one decimal, comma or point", () => {
    expect(parseMark("7,5")).toBe(7.5);
    expect(parseMark("10")).toBe(10);
    expect(parseMark("10.0")).toBe(10);
    expect(parseMark("0")).toBe(0);
    for (const bad of ["", "10.5", "11", "7.55", "-1", "x"]) expect(parseMark(bad)).toBeNull();
  });
  it("weights the overall mark like the Worker", () => {
    expect(weightedOverall({ positioning: 8, decisions: 6.5 }, grid)).toBe(7.4);
    expect(weightedOverall({ positioning: 8 }, grid)).toBe(4.8);
  });
});

describe("validateReport", () => {
  const v = { marks: { positioning: "8", decisions: "" }, notes: "", clips: [] };
  it("lets a draft leave marks blank but not a filed report", () => {
    expect(validateReport(v, grid, false).marks).toEqual({});
    expect(validateReport(v, grid, true).marks).toEqual({ decisions: "assessments.form.errors.markRequired" });
  });
  it("checks typed marks and clips", () => {
    const e = validateReport({ marks: { positioning: "12", decisions: "7" }, notes: "", clips: [{ minute: "131", text: "x" }, { minute: "40", text: " " }] }, grid, false);
    expect(e.marks).toEqual({ positioning: "assessments.form.errors.mark" });
    expect(e.clips).toEqual({ 0: "assessments.form.errors.minute", 1: "assessments.form.errors.clipText" });
  });
  it("keeps only valid marks in the request", () => {
    expect(marksOf({ marks: { positioning: "8,5", decisions: "" }, notes: "", clips: [] })).toEqual({ positioning: 8.5 });
  });
});

describe("text in the observer's language", () => {
  it("files notes under the author's locale", () => {
    expect(notesFor(" Bien placé ", "fr")).toEqual({ fr: "Bien placé", en: "" });
    expect(notesFor("Gut", "de")).toEqual({ fr: "", en: "", de: "Gut" });
  });
  it("gives clip labels the French and English the Worker requires, sorted by minute", () => {
    expect(clipsFor([{ minute: "70", text: "Penalty" }, { minute: "12", text: "Offside" }], "es")).toEqual([
      { minute: 12, label: { fr: "Offside", en: "Offside", es: "Offside" } },
      { minute: 70, label: { fr: "Penalty", en: "Penalty", es: "Penalty" } },
    ]);
  });
  it("reopens a draft with its own values", () => {
    const v = valuesFrom({ marks: { positioning: 8 }, notes: { fr: "", en: "Good" }, clips: [{ minute: 5, label: { fr: "x", en: "x" } }] }, grid, "en", (l) => l.en);
    expect(v).toEqual({ marks: { positioning: "8", decisions: "" }, notes: "Good", clips: [{ minute: "5", text: "x" }] });
  });
});

describe("observerDuties", () => {
  it("lists the matches observed (not refereed) with the observer's own report, newest first", () => {
    const matches = [match({ id: "m1", date: "2026-10-01" }), match({ id: "m2", date: "2026-10-10" }), match({ id: "m3", refereeId: "me" })];
    const reports = [{ matchId: "m1", observerId: "me", id: "a1" }, { matchId: "m2", observerId: "other", id: "a2" }];
    const duties = observerDuties(matches, reports, "me");
    expect(duties.map((d) => [d.match.id, d.report?.id ?? null])).toEqual([["m2", null], ["m1", "a1"]]);
  });
  it("counts a report late 48 hours after the match day", () => {
    expect(isLate("2026-10-20", new Date("2026-10-22T23:00:00Z"))).toBe(false);
    expect(isLate("2026-10-20", new Date("2026-10-23T00:30:00Z"))).toBe(true);
  });
});
