import { describe, expect, it } from "vitest";
import type { Partnership } from "@/lib/api/partnerships";
import { daysUntil, detailsFrom, detailsPatch, emptyDetails, filterPartnerships, pipelineSummary, toDetailsBody, validateDetails } from "@/lib/partnerships/rules";

const base: Partnership = {
  id: "p1", country: "SEN", countryName: "Senegal", countryNameFr: "Sénégal", flag: "🇸🇳", zone: "UFOA-A", countryActive: false,
  federationName: "Fédération Sénégalaise", federationCode: "FSF", stage: "negotiating", priority: "high", contactName: "Awa Diallo",
  contactRole: "SG", contactEmail: "awa@fsf.sn", contactPhone: null, ownerId: "u1", ownerName: "Admin", nextStep: "Send draft",
  nextStepDue: "2026-10-01", officialsEstimate: 300, agreementReference: null, agreementSignedOn: null, declinedReason: null,
  federationId: null, createdAt: "", updatedAt: "", lastContactOn: null, events: 3, overdue: true,
};
const row = (over: Partial<Partnership>): Partnership => ({ ...base, ...over });

describe("filterPartnerships", () => {
  const rows = [
    base,
    row({ id: "p2", country: "GHA", countryName: "Ghana", countryNameFr: "Ghana", federationName: "Ghana FA", federationCode: "GFA", stage: "onboarded", ownerId: "u2", contactName: null }),
    row({ id: "p3", country: "MLI", countryName: "Mali", countryNameFr: "Mali", federationName: "FEMAFOOT", federationCode: null, stage: "declined", contactName: "Moussa" }),
  ];
  it("keeps only live relationships by default and every one with 'all'", () => {
    expect(filterPartnerships(rows, { q: "", stage: "live", mine: null }).map((p) => p.id)).toEqual(["p1"]);
    expect(filterPartnerships(rows, { q: "", stage: "all", mine: null })).toHaveLength(3);
    expect(filterPartnerships(rows, { q: "", stage: "declined", mine: null }).map((p) => p.id)).toEqual(["p3"]);
  });
  it("searches federation, code, country names and contact, case-insensitively", () => {
    const f = (q: string) => filterPartnerships(rows, { q, stage: "all", mine: null }).map((p) => p.id);
    expect(f("gfa")).toEqual(["p2"]);
    expect(f("sénégal")).toEqual(["p1"]);
    expect(f("moussa")).toEqual(["p3"]);
    expect(f("  ")).toHaveLength(3);
  });
  it("narrows to one owner", () => {
    expect(filterPartnerships(rows, { q: "", stage: "all", mine: "u2" }).map((p) => p.id)).toEqual(["p2"]);
  });
});

describe("pipelineSummary", () => {
  it("counts live, overdue, signed and onboarded, and sums the officials still in play", () => {
    const s = pipelineSummary([base, row({ id: "b", stage: "agreement_signed", overdue: false, officialsEstimate: 100 }), row({ id: "c", stage: "onboarded", officialsEstimate: 999 }), row({ id: "d", stage: "declined", officialsEstimate: null })]);
    expect(s).toEqual({ live: 2, overdue: 1, signed: 1, onboarded: 1, officialsInPlay: 400 });
  });
});

describe("daysUntil", () => {
  it("counts whole days either way", () => {
    expect(daysUntil("2026-10-25", "2026-10-23")).toBe(2);
    expect(daysUntil("2026-10-20", "2026-10-23")).toBe(-3);
    expect(daysUntil("2026-10-23", "2026-10-23")).toBe(0);
  });
});

describe("partnership form", () => {
  it("needs a country and a name to create, and checks the optional fields' shape", () => {
    expect(validateDetails(emptyDetails("u1"), "create")).toMatchObject({ country: "admin.errors.pickCountry", federationName: "admin.errors.required" });
    const bad = { ...emptyDetails("u1"), country: "SEN", federationName: "FSF", federationCode: "x", contactEmail: "nope", contactPhone: "abc", officialsEstimate: "-4" };
    expect(Object.keys(validateDetails(bad, "create")).sort()).toEqual(["contactEmail", "contactPhone", "federationCode", "officialsEstimate"]);
    expect(validateDetails({ ...emptyDetails("u1"), federationName: "FSF" }, "edit")).toEqual({});
  });
  it("trims, upper-cases the code, lower-cases the e-mail and turns blanks into null", () => {
    const body = toDetailsBody({ ...emptyDetails("u1"), federationName: "  FSF  ", federationCode: " fsf ", contactEmail: " AWA@FSF.SN ", officialsEstimate: " 300 ", ownerId: "" });
    expect(body).toMatchObject({ federationName: "FSF", federationCode: "FSF", contactEmail: "awa@fsf.sn", officialsEstimate: 300, ownerId: null, contactName: null, nextStepDue: null });
  });
  it("sends only what changed", () => {
    expect(detailsPatch(base, detailsFrom(base))).toEqual({});
    expect(detailsPatch(base, { ...detailsFrom(base), nextStep: "Call back", officialsEstimate: "" })).toEqual({ nextStep: "Call back", officialsEstimate: null });
  });
});
