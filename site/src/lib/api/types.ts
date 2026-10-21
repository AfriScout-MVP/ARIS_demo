import type { Locale } from "@/locales";
import type { AvailabilityState, CrewRole, Localized } from "@/lib/store/types";

export type { ApiFixture } from "@/lib/store/types";

/** Exactly three roles: see api/docs/api-contract.md. */
export type Role = "admin" | "federation" | "referee";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** Referee accounts: their own official record. */
  officialId: string | null;
  /** Federation seats: the federation they sit for. */
  federationId: string | null;
  /** Federation seats: e.g. "FRMF". */
  federationCode: string | null;
  /** Federation seats: ISO alpha-3 of the one country they are confined to, e.g. "MAR". */
  country: string | null;
  locale: Locale;
}

export interface ApiNotification {
  id: string;
  title: Localized;
  detail: Localized;
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
