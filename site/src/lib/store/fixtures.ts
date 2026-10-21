// The fixture calendar and everything derived from it: crews, coverage, availability, rest.
// Empty until `applySnapshot` fills it.

import { addDays, daysBetween } from "./dates";
import { competitionById, CAF } from "./geography";
import type { AvailabilityState, CrewRole, CrewSlot, Fixture } from "./types";

export const fixtures: Fixture[] = [];
export const fixtureById = new Map<string, Fixture>();

/** Nations taking part in a fixture, used for the neutrality check (continental ties only). */
export const fixtureNations = new Map<string, string[]>();

/** Declared availability keyed `officialId|date`; what the officials told the API. */
export const availabilityDeclared = new Map<string, AvailabilityState>();

export const roleKey: Record<CrewRole, "roles.R" | "roles.AR1" | "roles.AR2" | "roles.FOURTH" | "roles.VAR" | "roles.AVAR" | "roles.OBS"> = {
  R: "roles.R",
  AR1: "roles.AR1",
  AR2: "roles.AR2",
  FOURTH: "roles.FOURTH",
  VAR: "roles.VAR",
  AVAR: "roles.AVAR",
  OBS: "roles.OBS",
};

/** The crew a fixture needs: the on-field trio and fourth, VAR where the competition has it, an observer on big ties. */
function crewShapeFor(fixture: Fixture): CrewRole[] {
  const comp = competitionById.get(fixture.competitionId);
  const base: CrewRole[] = ["R", "AR1", "AR2", "FOURTH"];
  if (comp?.varEnabled) base.push("VAR", "AVAR");
  if (fixture.importance >= 70) base.push("OBS");
  return base;
}

/** Roles that must be filled before a fixture counts as covered. */
export function requiredRoles(fixture: Fixture): CrewRole[] {
  return crewShapeFor(fixture).filter((role) => role !== "OBS");
}

/** Is this a continental (CAF) fixture rather than a domestic one? */
export function isContinental(fixture: Pick<Fixture, "countryCode">) {
  return fixture.countryCode === CAF;
}

/** Officials a fixture may legally use: never from a country taking part. */
export function eligibleNations(fixture: Fixture): (code: string) => boolean {
  if (fixture.countryCode !== CAF) {
    // Domestic fixture — staffed by that country's own list.
    return (code) => code === fixture.countryCode;
  }
  const involved = fixtureNations.get(fixture.id) ?? [];
  return (code) => !involved.includes(code);
}

export function openSlots(fixture: Fixture) {
  return fixture.crew.filter(
    (s) => s.role !== "OBS" && (s.state === "empty" || s.state === "declined"),
  ).length;
}

export function crewIsComplete(fixture: Fixture) {
  return fixture.crew.every(
    (s) => s.role === "OBS" || s.state === "confirmed" || s.state === "pending",
  );
}

export function fixturesInWeek(weekStart: string) {
  const end = addDays(weekStart, 6);
  return fixtures.filter((f) => f.date >= weekStart && f.date <= end);
}

/** Declared availability for a day: what the official told the API, "assigned" if they already have a match, else available. */
export function availabilityFor(officialId: string, date: string): AvailabilityState {
  const assignedHere = fixtures.some(
    (f) => f.date === date && f.crew.some((s) => s.officialId === officialId && s.state !== "empty"),
  );
  if (assignedHere) return "assigned";
  return availabilityDeclared.get(`${officialId}|${date}`) ?? "available";
}

/** Days since this official's last appointment before `date`; 14 when there is none in the loaded window. */
export function restDays(officialId: string, date: string) {
  const past = fixtures
    .filter((f) => f.date < date && f.crew.some((s) => s.officialId === officialId))
    .map((f) => f.date)
    .sort();
  const last = past[past.length - 1];
  return last ? daysBetween(last, date) : 14;
}

/** A slot change the API accepted: reflect it so every screen sees the same crew. */
export function patchFixtureCrew(fixtureId: string, crew: CrewSlot[]) {
  const fixture = fixtureById.get(fixtureId);
  if (fixture) fixture.crew = crew;
}
