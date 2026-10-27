import { api } from "./client";
import { API_BASE } from "./config";
import type { CrewRole } from "@/lib/core/types";

/* A referee's own space: designations, convocations, calendar, money, days off, comments, defence. */

export type DesignationState = "pending" | "confirmed" | "declined";

export interface MyDesignation {
  fixtureId: string;
  role: CrewRole;
  state: DesignationState;
  version: number;
  home: string;
  away: string;
  /** Local at the venue. */
  date: string;
  kickoff: string;
  kickoffAt: string;
  venue: string | null;
  city: string | null;
  competition: string;
  /** The crew's pipeline: draft → awaiting_confirmation → validated → published. */
  fixtureStatus: string;
  played: boolean;
}

export const listMyDesignations = (query: { from?: string; to?: string; state?: DesignationState } = {}, signal?: AbortSignal) =>
  api<{ designations: MyDesignation[] }>("/me/designations", { query: { ...query }, signal }).then((r) => r.designations);

export const respondToDesignation = (d: Pick<MyDesignation, "fixtureId" | "role">, response: "accept" | "decline", reason?: string) =>
  api(`/fixtures/${encodeURIComponent(d.fixtureId)}/designations/${d.role}/respond`, { method: "POST", body: { response, reason } });

/** Same origin as the app: a plain link downloads it with the session cookie. */
export const calendarHref = `${API_BASE}/api/v1/me/calendar.ics`;

export interface Convocation {
  fixtureId: string;
  role: CrewRole;
  competition: string;
  season: string | null;
  round: string | number | null;
  home: string;
  away: string;
  date: string;
  kickoff: string;
  kickoffAt: string;
  timezone: string;
  venue: string | null;
  city: string | null;
  countryCode: string;
  publishedAt: string | null;
  issuer: { name: string; code: string | null } | null;
  official: { name: string; matricule: string | null; licenceNo: string | null };
  crew: Array<{ role: CrewRole; name: string; me: boolean }>;
}

export const getConvocation = (fixtureId: string, signal?: AbortSignal) =>
  api<{ convocation: Convocation }>(`/me/convocations/${encodeURIComponent(fixtureId)}`, { signal }).then((r) => r.convocation);

/* ---- history ---- */

export interface PlayedMatch {
  id: string;
  date: string;
  home: string;
  away: string;
  score: string;
  role: CrewRole;
}

export interface Page<T> {
  rows: T[];
  hasMore: boolean;
}

export const HISTORY_PAGE = 20;

export const listMyHistory = (offset: number, signal?: AbortSignal) =>
  api<{ matches: PlayedMatch[]; hasMore: boolean }>("/me/history", { query: { limit: HISTORY_PAGE, offset }, signal }).then(
    (r): Page<PlayedMatch> => ({ rows: r.matches, hasMore: r.hasMore }),
  );

/* ---- days off ---- */

export type DayState = "unavailable" | "travelling" | "resting";
export type DayReason = "leave" | "work" | "injury" | "other";

export interface DeclaredDay {
  date: string;
  state: DayState;
  reason: DayReason | null;
  note: string | null;
}

export const listDeclaredDays = (officialId: string, from: string, to: string, signal?: AbortSignal) =>
  api<{ declared: DeclaredDay[] }>(`/officials/${encodeURIComponent(officialId)}/availability`, { query: { from, to }, signal }).then((r) => r.declared);

export const declareDays = (officialId: string, body: { dates: string[]; state: DayState; reason?: DayReason }) =>
  api<{ declared: number; conflicts: unknown[] }>(`/officials/${encodeURIComponent(officialId)}/availability`, { method: "PUT", body });

export const withdrawDay = (officialId: string, date: string) =>
  api<{ ok: true }>(`/officials/${encodeURIComponent(officialId)}/availability/${encodeURIComponent(date)}`, { method: "DELETE" });

/* ---- money ---- */

export interface EarningsPeriod {
  period: string;
  currency: string;
  paid: number;
  pending: number;
  contested: number;
  lines: number;
}

export const getEarnings = (by: "season" | "year", signal?: AbortSignal) =>
  api<{ periods: EarningsPeriod[] }>("/me/earnings", { query: { by }, signal }).then((r) => r.periods);

export interface PaymentSlip {
  id: string;
  role: CrewRole;
  base: number;
  transport: number;
  lodging: number;
  meals: number;
  bonus: number;
  deduction: number;
  total: number;
  currency: string;
  paidAt: string;
  paymentRef: string | null;
  fixtureId: string;
  home: string;
  away: string;
  date: string;
  kickoff: string;
  competition: string;
  season: string | null;
  venue: string | null;
  city: string | null;
  officialName: string;
  matricule: string | null;
  licenceNo: string | null;
  payer: { name: string; code: string | null } | null;
}

export const getPaymentSlip = (id: string, signal?: AbortSignal) =>
  api<{ slip: PaymentSlip }>(`/me/payments/${encodeURIComponent(id)}/slip`, { signal }).then((r) => r.slip);

export const withdrawAdvance = (id: string) => api<{ ok: true }>(`/me/advances/${encodeURIComponent(id)}`, { method: "DELETE" });

/* ---- assessments: the referee's voice ---- */

export type CommentKind = "comment" | "contest" | "response";

export interface AssessmentComment {
  id: string;
  kind: CommentKind;
  body: string;
  authorRole: "admin" | "federation" | "referee";
  authorName: string | null;
  createdAt: string;
}

export const listAssessmentComments = (id: string, signal?: AbortSignal) =>
  api<{ comments: AssessmentComment[]; contest: "none" | "open" | "answered" }>(`/assessments/${encodeURIComponent(id)}/comments`, { signal });

export const postAssessmentComment = (id: string, body: string, kind?: "comment" | "contest") =>
  api<{ comment: AssessmentComment }>(`/assessments/${encodeURIComponent(id)}/comments`, { method: "POST", body: { body, ...(kind ? { kind } : {}) } });

/* ---- discipline: a written defence ---- */

export interface Defence {
  statement: string;
  filedAt: string;
  updatedAt: string;
  filedBy: string | null;
}

export const getDefence = (caseId: string, signal?: AbortSignal) =>
  api<{ defence: Defence | null }>(`/cases/${encodeURIComponent(caseId)}/defence`, { signal }).then((r) => r.defence);

export const fileDefence = (caseId: string, statement: string) =>
  api<{ ok: true; updated: boolean }>(`/cases/${encodeURIComponent(caseId)}/defence`, { method: "POST", body: { statement } });
