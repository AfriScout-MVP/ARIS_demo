// Played matches, with their decisions, physical load and heat points. Empty until `applySnapshot` fills them.

import type { MatchRecord } from "./types";

export const matches: MatchRecord[] = [];
export const matchById = new Map<string, MatchRecord>();

export const EMPTY_PHYSICAL: MatchRecord["physical"] = {
  distanceKm: 0,
  sprints: 0,
  topSpeed: 0,
  avgDistanceToBall: 0,
  diagonalAdherence: 0,
};

/** Matches played by one referee, most recent first. */
export function matchesOf(refereeId: string) {
  return matches
    .filter((m) => m.refereeId === refereeId)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));
}
