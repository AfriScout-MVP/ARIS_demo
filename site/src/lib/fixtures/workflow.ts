import type { TKey } from "@/locales";
import type { CrewSlot, DesignationStatus, Fixture } from "@/lib/store/types";

/* The designation pipeline as the Worker enforces it: draft → awaiting confirmation → validated → published. Pure. */

export type Step = "submit" | "validate" | "publish";

/** Roles that must be filled; the observer is welcome but never required. */
export const requiredSlots = (crew: CrewSlot[]) => crew.filter((s) => s.role !== "OBS");

export interface NextStep {
  step: Step | null;
  /** Why the step cannot be taken yet (crew incomplete, not every official has confirmed). */
  blocked: TKey | null;
}

export function nextStep(f: Pick<Fixture, "designationStatus" | "status" | "played">, crew: CrewSlot[]): NextStep {
  if (f.played || f.status !== "scheduled") return { step: null, blocked: null };
  const required = requiredSlots(crew);
  if (f.designationStatus === "draft") {
    const open = required.some((s) => !s.officialId || s.state === "declined" || s.state === "empty");
    return { step: "submit", blocked: open ? "fixtures.blocked.incomplete" : null };
  }
  if (f.designationStatus === "awaiting_confirmation") {
    return { step: "validate", blocked: required.some((s) => s.state !== "confirmed") ? "fixtures.blocked.unconfirmed" : null };
  }
  if (f.designationStatus === "validated") return { step: "publish", blocked: null };
  return { step: null, blocked: null };
}

export const STATUS_TONE: Record<DesignationStatus, "neutral" | "amber" | "var" | "pitch"> = {
  draft: "neutral",
  awaiting_confirmation: "amber",
  validated: "var",
  published: "pitch",
};

/** A result can be recorded once kick-off has passed, on a scheduled match with a referee. */
export function canRecordResult(f: Pick<Fixture, "kickoffAt" | "status" | "played">, crew: CrewSlot[], now: Date): boolean {
  if (f.played || f.status !== "scheduled" || !f.kickoffAt) return false;
  if (Date.parse(f.kickoffAt) > now.getTime()) return false;
  const r = crew.find((s) => s.role === "R");
  return Boolean(r?.officialId) && r?.state !== "declined";
}

/**
 * The Worker asks for a written reason when a change reaches people already involved:
 * postponing or cancelling a match with designated officials, or moving one whose crew is validated or confirmed.
 */
export function reasonNeeded(f: Pick<Fixture, "designationStatus">, crew: CrewSlot[], change: { closing: boolean; rescheduled: boolean }): boolean {
  const designated = crew.filter((s) => s.officialId);
  if (change.closing && designated.length > 0) return true;
  return change.rescheduled && (f.designationStatus === "validated" || f.designationStatus === "published" || designated.some((s) => s.state === "confirmed"));
}

export interface FixtureValues {
  competitionId: string;
  round: string;
  roundLabel: string;
  homeTeamId: string;
  awayTeamId: string;
  stadiumId: string;
  date: string;
  time: string;
  importance: string;
}

export type FixtureField = keyof FixtureValues;
export type FixtureErrors = Partial<Record<FixtureField, TKey>>;

export function validateFixture(v: FixtureValues, opts: { creating: boolean }): FixtureErrors {
  const e: FixtureErrors = {};
  if (opts.creating) {
    if (!v.competitionId) e.competitionId = "fixtures.errors.competition";
    if (!v.homeTeamId) e.homeTeamId = "fixtures.errors.team";
    if (!v.awayTeamId) e.awayTeamId = "fixtures.errors.team";
    else if (v.awayTeamId === v.homeTeamId) e.awayTeamId = "fixtures.errors.sameTeam";
  }
  if (!/^\d{1,3}$/.test(v.round.trim()) || Number(v.round) < 1 || Number(v.round) > 100) e.round = "fixtures.errors.round";
  if (v.roundLabel.trim().length > 60) e.roundLabel = "fixtures.errors.roundLabel";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) e.date = "fixtures.errors.date";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time)) e.time = "fixtures.errors.time";
  if (!/^\d{1,3}$/.test(v.importance.trim()) || Number(v.importance) > 100) e.importance = "fixtures.errors.importance";
  return e;
}

/** "2-1", "2 : 1", "2–1" → [2, 1]. */
export function parseScore(raw: string): [number, number] | null {
  const m = raw.trim().match(/^(\d{1,2})\s*[-–:]\s*(\d{1,2})$/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}
