import type { AvailabilityState, CrewRole, CrewSlot, Fixture } from "@/lib/core/types";

export type Role = "admin" | "commission" | "observer" | "referee";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  officialId: string | null;
  /** "all", "zone:UNAF" or "country:EGY" */
  scope: string;
  locale: "fr" | "en";
}

/** A fixture as the Worker returns it — the app's `Fixture` plus the workflow state. */
export interface ApiFixture extends Omit<Fixture, "crew"> {
  homeCode?: string | null;
  awayCode?: string | null;
  designationStatus: "draft" | "awaiting_confirmation" | "validated" | "published";
  crew: Array<CrewSlot & { version?: number }>;
}

export interface ApiNotification {
  id: string;
  title: { en: string; fr: string };
  detail: { en: string; fr: string };
  tone: "pitch" | "amber" | "red" | "var";
  href: string;
  createdAt: string;
  read: boolean;
}

export interface AutofillResult {
  runId: string | null;
  filled: number;
  skipped: number;
  stale?: number;
  assignments: Array<{ fixtureId: string; role: CrewRole; officialId: string; reason: { rating: number; travel: number; rest: number; friction: string; score: number } }>;
}

export interface SnapshotAvailability {
  officialId: string;
  date: string;
  state: AvailabilityState;
}
