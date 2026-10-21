// Referees and assistants. Empty until `applySnapshot` fills them.

import { countryByCode } from "./geography";
import type { Assistant, OfficialRef, Referee } from "./types";

export const referees: Referee[] = [];
export const refereeById = new Map<string, Referee>();
export const assistants: Assistant[] = [];
export const assistantById = new Map<string, Assistant>();

export function refereeCountry(referee: Referee) {
  return countryByCode.get(referee.countryCode);
}

/** A referee or an assistant by id, in one common shape. */
export function officialById(id: string): OfficialRef | undefined {
  const r = refereeById.get(id);
  if (r) return { id: r.id, name: r.name, initials: r.initials, photoUrl: r.photoUrl, countryCode: r.countryCode, kind: "referee" };
  const a = assistantById.get(id);
  if (a) return { id: a.id, name: a.name, initials: a.initials, photoUrl: a.photoUrl, countryCode: a.countryCode, kind: "assistant" };
  return undefined;
}
