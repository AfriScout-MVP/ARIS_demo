import { api } from "./client";
import type { ApiFixture } from "./types";
import type { CrewRole } from "@/lib/store/types";

/* A fixture's life: created, rescheduled, its crew sent for confirmation, validated, published, then its result. */

export interface FixtureBody {
  competitionId: string;
  round: number;
  roundLabel?: string;
  homeTeamId: string;
  awayTeamId: string;
  stadiumId?: string | null;
  /** Local date and time at the venue. */
  date: string;
  time: string;
  importance: number;
  risk?: "low" | "medium" | "high";
}

export type FixturePatch = Partial<{
  date: string;
  time: string;
  stadiumId: string;
  importance: number;
  risk: "low" | "medium" | "high";
  round: number;
  roundLabel: string | null;
  status: "scheduled" | "postponed" | "cancelled";
  reason: string;
}>;

export interface RescheduleWarning {
  role: CrewRole;
  officialId: string;
  blockers: string[];
}

export interface Convocation {
  role: CrewRole;
  roleLabel: { fr: string; en: string };
  official?: { id: string; name: string; email: string | null; phone: string | null };
  state: string;
}

export interface HistoryEntry {
  id: number;
  role: CrewRole;
  action: string;
  fromName: string | null;
  toName: string | null;
  fromState: string | null;
  toState: string | null;
  actorKind: string;
  actorName: string | null;
  reason: string | null;
  at: string;
}

export interface FixtureEvent {
  id: number;
  at: string;
  action: string;
  actorName: string | null;
  reason: string | null;
}

const path = (id: string, rest = "") => `/fixtures/${encodeURIComponent(id)}${rest}`;

export const createFixture = (body: FixtureBody) => api<{ fixture: ApiFixture }>("/fixtures", { method: "POST", body }).then((r) => r.fixture);

export const updateFixture = (id: string, body: FixturePatch) =>
  api<{ fixture: ApiFixture; warnings: RescheduleWarning[] }>(path(id), { method: "PATCH", body });

export const advanceFixture = (id: string, step: "submit" | "validate" | "publish") =>
  api<{ fixture: ApiFixture; changed: boolean }>(path(id, `/${step}`), { method: "POST" });

export const recordResult = (id: string, body: { homeScore: number; awayScore: number; attendance?: number }) =>
  api<{ matchId: string; fixture: ApiFixture }>(path(id, "/result"), { method: "POST", body });

export const getConvocations = (id: string, signal?: AbortSignal) => api<{ convocations: Convocation[] }>(path(id, "/convocations"), { signal }).then((r) => r.convocations);

export const getFixtureHistory = (id: string, signal?: AbortSignal) => api<{ history: HistoryEntry[]; events: FixtureEvent[] }>(path(id, "/history"), { signal });
