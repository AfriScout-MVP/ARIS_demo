// The referee-decision taxonomy (event type → sub-event → outcome), as fetched from
// `GET /matches/event-types`. One source of truth lives on the Worker (api/src/domain/eventTaxonomy.ts);
// these are pure lookups and a thin mirror of its `resolveEventFlow`, against whatever it serves.

import { pickLocalized } from "@/lib/i18n/localized";
import type { Locale } from "@/locales";
import type { EventOutcome, EventSubEvent, EventType } from "@/lib/store/types";

export function findEventType(types: EventType[] | undefined, key: string): EventType | undefined {
  return types?.find((e) => e.key === key);
}

export function findSubEvent(types: EventType[] | undefined, eventType: string, subEvent: string): EventSubEvent | undefined {
  return findEventType(types, eventType)?.subEvents.find((s) => s.key === subEvent);
}

export function findOutcome(types: EventType[] | undefined, eventType: string, subEvent: string, outcome: string): EventOutcome | undefined {
  return findSubEvent(types, eventType, subEvent)?.outcomes?.find((o) => o.key === outcome);
}

const label = (locale: Locale, labelFr: string, labelEn: string) => pickLocalized({ fr: labelFr, en: labelEn }, locale);

export function eventTypeLabel(types: EventType[] | undefined, key: string, locale: Locale): string {
  const found = findEventType(types, key);
  return found ? label(locale, found.labelFr, found.labelEn) : key;
}

export function subEventLabel(types: EventType[] | undefined, eventType: string, subEvent: string, locale: Locale): string {
  const found = findSubEvent(types, eventType, subEvent);
  return found ? label(locale, found.labelFr, found.labelEn) : subEvent;
}

export function outcomeLabel(types: EventType[] | undefined, eventType: string, subEvent: string, outcome: string, locale: Locale): string {
  const found = findOutcome(types, eventType, subEvent, outcome);
  return found ? label(locale, found.labelFr, found.labelEn) : outcome;
}

export interface EventFlow {
  valid: boolean;
  needsSubEvent: boolean;
  needsOutcome: boolean;
  subEvents: readonly EventSubEvent[];
  outcomes: readonly EventOutcome[];
}

/** Mirrors the Worker's `resolveEventFlow`, against the taxonomy fetched from it — not a second copy of it. */
export function resolveEventFlow(types: EventType[] | undefined, eventType: string, subEvent?: string, outcome?: string): EventFlow {
  const type = findEventType(types, eventType);
  if (!type) return { valid: false, needsSubEvent: false, needsOutcome: false, subEvents: [], outcomes: [] };
  const sub = subEvent ? type.subEvents.find((s) => s.key === subEvent) : undefined;
  const needsSubEvent = type.subEvents.length > 0;
  const needsOutcome = !!sub?.outcomes?.length;
  const subValid = !needsSubEvent || !!sub;
  const outcomeValid = !needsOutcome || !outcome || sub!.outcomes!.some((o) => o.key === outcome);
  return { valid: subValid && outcomeValid, needsSubEvent, needsOutcome, subEvents: type.subEvents, outcomes: sub?.outcomes ?? [] };
}
