import { api } from "./client";
import type { Criterion, EventType, Localized, MatchDecision, MatchRecord } from "@/lib/store/types";

/** A played match as `GET /matches` lists it: the Worker never serializes its decisions in the list. */
export type LightMatch = Omit<MatchRecord, "decisions" | "heatPoints">;

/* Observer reports. Staff see their country's; a referee sees the reports they wrote and, once released, those about them. */

export type ReportState = "draft" | "filed" | "overdue";

export interface Clip {
  minute: number;
  label: Localized;
}

export interface AssessmentRow {
  id: string;
  matchId: string;
  refereeId: string;
  observerId: string;
  state: ReportState;
  published: boolean;
  countryCode: string | null;
  filedHoursAfter: number | null;
  filedAt: string | null;
  overall: number;
  marks: Record<string, number>;
  notes: Localized;
  clips: Clip[];
}

/** A played match as the Worker lists it (without its decisions). */
export interface MatchRow {
  id: string;
  fixtureId: string | null;
  home: string;
  away: string;
  competitionId: string;
  countryCode: string | null;
  date: string;
  venue: string | null;
  status: string;
  score: string;
  refereeId: string | null;
}

export interface NewReportBody {
  matchId: string;
  /** Staff only: who wrote the report. A referee files as themselves. */
  observerId?: string;
  marks: Record<string, number>;
  notes: Localized;
  clips: Clip[];
  state: "draft" | "filed";
}

export interface EditReportBody {
  marks?: Record<string, number>;
  notes?: Localized;
  clips?: Clip[];
  /** Files a draft. */
  file?: boolean;
  /** Required by the Worker to correct a filed report. */
  reason?: string;
}

export const listCriteria = (signal?: AbortSignal) => api<{ criteria: Criterion[] }>("/evaluation-criteria", { signal }).then((r) => r.criteria);

export const listAssessments = (query: { refereeId?: string; matchId?: string; state?: ReportState } = {}, signal?: AbortSignal) =>
  api<{ assessments: AssessmentRow[] }>("/assessments", { query: { ...query }, signal }).then((r) => r.assessments);

/** For a referee: the matches they refereed and those they were appointed to observe. */
export const listMyMatches = (signal?: AbortSignal) => api<{ matches: MatchRow[] }>("/matches", { query: { limit: 100 }, signal }).then((r) => r.matches);

/** Staff see their country's (or every country's for an administrator); a tagger sees their own country's. */
export const listMatches = (
  query: { country?: string; refereeId?: string; status?: string; limit?: number } = {},
  signal?: AbortSignal,
) => api<{ matches: LightMatch[] }>("/matches", { query, signal }).then((r) => r.matches);

/** One match with its full decision timeline and heat points. */
export const getMatch = (id: string, signal?: AbortSignal) =>
  api<{ match: MatchRecord }>(`/matches/${encodeURIComponent(id)}`, { signal }).then((r) => r.match);

/** The referee-decision taxonomy (event type → sub-event → outcome), served once from the Worker. */
export const listEventTypes = (signal?: AbortSignal) => api<{ eventTypes: EventType[] }>("/matches/event-types", { signal }).then((r) => r.eventTypes);

export const createReport = (body: NewReportBody) =>
  api<{ assessment: AssessmentRow }>("/assessments", { method: "POST", body }).then((r) => r.assessment);

export const updateReport = (id: string, body: EditReportBody) =>
  api<{ assessment: AssessmentRow }>(`/assessments/${encodeURIComponent(id)}`, { method: "PATCH", body }).then((r) => r.assessment);

export const publishReport = (id: string) => api<{ ok: true; changed: boolean }>(`/assessments/${encodeURIComponent(id)}/publish`, { method: "POST" });

/** Administrators only: replaces the platform grid (2 to 12 criteria, weights totalling 100). */
export const saveCriteria = (criteria: Criterion[]) =>
  api<{ criteria: Criterion[] }>("/evaluation-criteria", { method: "PUT", body: { criteria } }).then((r) => r.criteria);

export interface DecisionBody {
  minute: number;
  eventType: string;
  subEvent?: string;
  outcome?: string;
  description: Localized;
  initialCall: MatchDecision["initialCall"];
  varReview: boolean;
  finalCall: MatchDecision["finalCall"];
  confidence: number;
  pressureIndex: number;
  distance: number;
  players: string[];
}

export const logDecision = (matchId: string, body: DecisionBody) =>
  api<{ id: string }>(`/matches/${encodeURIComponent(matchId)}/decisions`, { method: "POST", body });

export const removeDecision = (matchId: string, decisionId: string) =>
  api<{ ok: true }>(`/matches/${encodeURIComponent(matchId)}/decisions/${encodeURIComponent(decisionId)}`, { method: "DELETE" });
