// Types shared by the browser app and the Cloudflare Worker. Nothing in this
// folder may import from the app (React, mock data, the DOM) — the Worker
// bundles it as-is, and the designation rules must behave identically on both.

export type Zone = "UNAF" | "UFOA-A" | "UFOA-B" | "UNIFFAC" | "CECAFA" | "COSAFA";

export type CrewRole = "R" | "AR1" | "AR2" | "FOURTH" | "VAR" | "AVAR" | "OBS";
export type SlotState = "confirmed" | "pending" | "declined" | "empty";

export const crewRoles: CrewRole[] = ["R", "AR1", "AR2", "FOURTH", "VAR", "AVAR", "OBS"];

export interface CrewSlot {
  role: CrewRole;
  officialId: string | null;
  state: SlotState;
  /** Bumped by the Worker on every change to the slot — used to detect concurrent edits. */
  version?: number;
}

export interface Fixture {
  id: string;
  countryCode: string;
  competitionId: string;
  matchday: number;
  date: string;
  kickoff: string;
  home: string;
  away: string;
  city: string;
  venue: string;
  importance: number;
  risk: "low" | "medium" | "high";
  crew: CrewSlot[];
  played: boolean;
}

export type AvailabilityState = "available" | "unavailable" | "assigned" | "resting" | "travelling";

export type BlockerId =
  | "neutrality"
  | "pool"
  | "unavailable"
  | "rest"
  | "qualification"
  | "duplicate"
  /** Already designated to another match the same day. */
  | "double"
  /** Declared a link with one of the clubs or nations in this match. */
  | "conflict";

export interface Candidate {
  id: string;
  name: string;
  initials: string;
  countryCode: string;
  kind: "referee" | "assistant";
  score: number;
  rating: number;
  fitness: number;
  travelHours: number;
  rest: number;
  frictionRisk: "low" | "medium" | "high";
  h2h: number;
  /** True when this official is only available because the home list ran short. */
  cover: boolean;
  blockers: BlockerId[];
}

/** One official as the engine sees them — a referee or an assistant. */
export interface PoolEntry {
  id: string;
  name: string;
  initials: string;
  countryCode: string;
  kind: "referee" | "assistant";
  rating: number;
  fitness: number;
  suspended: boolean;
  varQualified: boolean;
  trend: number;
}
