import type { Locale, TKey } from "@/locales";
import type { EventType, Localized, MatchDecision } from "@/lib/store/types";
import { resolveEventFlow } from "./eventTypes";

/* Logging a refereeing decision on a played match: event type → sub-event → outcome. Mirrors the Worker's checks. Pure. */

export interface DecisionValues {
  minute: string;
  eventType: string;
  subEvent: string;
  outcome: string;
  description: string;
  initialCall: MatchDecision["initialCall"];
  varReview: boolean;
  finalCall: MatchDecision["finalCall"];
  confidence: string;
  pressureIndex: string;
  distance: string;
  /** Comma-separated. */
  players: string;
}

export type DecisionField = keyof DecisionValues;
export type DecisionErrors = Partial<Record<DecisionField, TKey>>;

export const emptyDecision = (types: EventType[] = []): DecisionValues => {
  const type = types[0];
  const sub = type?.subEvents[0];
  return {
    minute: "",
    eventType: type?.key ?? "",
    subEvent: sub?.key ?? "",
    outcome: sub?.outcomes?.[0]?.key ?? "",
    description: "",
    initialCall: "given",
    varReview: false,
    finalCall: "confirmed",
    confidence: "",
    pressureIndex: "",
    distance: "",
    players: "",
  };
};

/** Resets sub-event and outcome to the new event type's first ones, the way a cascading select should. */
export function withEventType(types: EventType[], v: DecisionValues, eventType: string): DecisionValues {
  const type = types.find((e) => e.key === eventType);
  const sub = type?.subEvents[0];
  return { ...v, eventType, subEvent: sub?.key ?? "", outcome: sub?.outcomes?.[0]?.key ?? "" };
}

/** Resets the outcome to the new sub-event's first one. */
export function withSubEvent(types: EventType[], v: DecisionValues, subEvent: string): DecisionValues {
  const sub = types.find((e) => e.key === v.eventType)?.subEvents.find((s) => s.key === subEvent);
  return { ...v, subEvent, outcome: sub?.outcomes?.[0]?.key ?? "" };
}

/** A number in [min, max], blank allowed for the optional measures; a decimal comma is accepted. */
const num = (raw: string) => (raw.trim() === "" ? null : /^\d{1,3}([.,]\d{1,2})?$/.test(raw.trim()) ? Number(raw.trim().replace(",", ".")) : NaN);
const out = (v: number | null, max: number) => v !== null && (Number.isNaN(v) || v < 0 || v > max);

export const playersOf = (raw: string) =>
  raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

export function validateDecision(types: EventType[], v: DecisionValues): DecisionErrors {
  const e: DecisionErrors = {};
  const minute = num(v.minute);
  if (minute === null || !Number.isInteger(minute) || out(minute, 130)) e.minute = "matchReview.log.errors.minute";
  const flow = resolveEventFlow(types, v.eventType, v.subEvent || undefined, v.outcome || undefined);
  if (!v.eventType || !flow.valid) e.eventType = "matchReview.log.errors.eventType";
  const text = v.description.trim();
  if (!text) e.description = "matchReview.log.errors.description";
  else if (text.length > 300) e.description = "matchReview.log.errors.descriptionLong";
  if (out(num(v.confidence), 100)) e.confidence = "matchReview.log.errors.percent";
  if (out(num(v.pressureIndex), 100)) e.pressureIndex = "matchReview.log.errors.percent";
  if (out(num(v.distance), 120)) e.distance = "matchReview.log.errors.distance";
  const players = playersOf(v.players);
  if (players.length > 6 || players.some((p) => p.length > 80)) e.players = "matchReview.log.errors.players";
  return e;
}

/** An overturned call is, by definition, one the VAR looked at. */
export const finalCallOptions = (varReview: boolean): MatchDecision["finalCall"][] => (varReview ? ["confirmed", "overturned"] : ["confirmed"]);

/**
 * The Worker wants a French and an English description. The author writes once, in their language: that text
 * fills both required languages and the author's own.
 */
export function descriptionFor(text: string, locale: Locale): Localized {
  const t = text.trim();
  const out: Localized = { fr: t, en: t };
  if (locale === "es" || locale === "de") out[locale] = t;
  return out;
}

export function toDecisionBody(v: DecisionValues, locale: Locale) {
  const or0 = (raw: string) => num(raw) ?? 0;
  return {
    minute: Number(v.minute.trim()),
    eventType: v.eventType,
    ...(v.subEvent ? { subEvent: v.subEvent } : {}),
    ...(v.outcome ? { outcome: v.outcome } : {}),
    description: descriptionFor(v.description, locale),
    initialCall: v.initialCall,
    varReview: v.varReview,
    finalCall: v.varReview ? v.finalCall : ("confirmed" as const),
    confidence: or0(v.confidence),
    pressureIndex: or0(v.pressureIndex),
    distance: or0(v.distance),
    players: playersOf(v.players),
  };
}
