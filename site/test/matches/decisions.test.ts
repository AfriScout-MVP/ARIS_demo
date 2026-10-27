import { describe, expect, it } from "vitest";
import { descriptionFor, emptyDecision, finalCallOptions, playersOf, toDecisionBody, validateDecision, type DecisionValues } from "@/lib/matches/decisions";
import type { EventType } from "@/lib/store/types";

const TYPES: EventType[] = [
  {
    key: "foul_advantage",
    labelFr: "Faute / avantage",
    labelEn: "Foul / Advantage",
    subEvents: [{ key: "foul_given", labelFr: "Faute sifflée", labelEn: "Foul Given", outcomes: [{ key: "confirmed", labelFr: "Confirmée", labelEn: "Confirmed" }] }],
  },
  {
    key: "card",
    labelFr: "Carton",
    labelEn: "Card",
    subEvents: [{ key: "yellow", labelFr: "Carton jaune", labelEn: "Yellow Card", outcomes: [{ key: "issued", labelFr: "Donné", labelEn: "Issued" }] }],
  },
];

const ok = (over: Partial<DecisionValues> = {}): DecisionValues => ({ ...emptyDecision(TYPES), minute: "34", description: "Penalty for a trip", ...over });

describe("validateDecision", () => {
  it("accepts a minimal decision", () => {
    expect(validateDecision(TYPES, ok())).toEqual({});
  });
  it("checks the minute, text and measures as the Worker does", () => {
    expect(validateDecision(TYPES, ok({ minute: "" })).minute).toBe("matchReview.log.errors.minute");
    expect(validateDecision(TYPES, ok({ minute: "131" })).minute).toBe("matchReview.log.errors.minute");
    expect(validateDecision(TYPES, ok({ minute: "45.5" })).minute).toBe("matchReview.log.errors.minute");
    expect(validateDecision(TYPES, ok({ minute: "0" })).minute).toBeUndefined();
    expect(validateDecision(TYPES, ok({ description: "  " })).description).toBe("matchReview.log.errors.description");
    expect(validateDecision(TYPES, ok({ description: "x".repeat(301) })).description).toBe("matchReview.log.errors.descriptionLong");
    expect(validateDecision(TYPES, ok({ confidence: "101", pressureIndex: "abc", distance: "121" }))).toEqual({
      confidence: "matchReview.log.errors.percent",
      pressureIndex: "matchReview.log.errors.percent",
      distance: "matchReview.log.errors.distance",
    });
    expect(validateDecision(TYPES, ok({ confidence: "87,5", distance: "12.4" }))).toEqual({});
    expect(validateDecision(TYPES, ok({ players: "a, b, c, d, e, f, g" })).players).toBe("matchReview.log.errors.players");
    expect(validateDecision(TYPES, ok({ eventType: "unknown" })).eventType).toBe("matchReview.log.errors.eventType");
  });
});

describe("toDecisionBody", () => {
  it("fills both required languages and the author's own", () => {
    expect(descriptionFor(" Hand ", "es")).toEqual({ fr: "Hand", en: "Hand", es: "Hand" });
    expect(descriptionFor("Main", "fr")).toEqual({ fr: "Main", en: "Main" });
  });
  it("defaults blank measures to 0, splits players, and never sends an overturn without a VAR review", () => {
    const body = toDecisionBody(ok({ varReview: false, finalCall: "overturned", confidence: "87,5", players: " Diallo , ,Mané " }), "en");
    expect(body).toMatchObject({ minute: 34, finalCall: "confirmed", confidence: 87.5, pressureIndex: 0, distance: 0, players: ["Diallo", "Mané"] });
    expect(toDecisionBody(ok({ varReview: true, finalCall: "overturned" }), "en").finalCall).toBe("overturned");
  });
  it("offers an overturn only after a review", () => {
    expect(finalCallOptions(false)).toEqual(["confirmed"]);
    expect(finalCallOptions(true)).toEqual(["confirmed", "overturned"]);
    expect(playersOf("")).toEqual([]);
  });
});
