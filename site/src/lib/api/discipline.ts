import { api } from "./client";

/* Incidents and disciplinary cases. A report alone never sanctions anyone: only a decided case does. */

export const INCIDENT_KINDS = ["absence", "lateness", "refusal", "incident"] as const;
export type IncidentKind = (typeof INCIDENT_KINDS)[number];
export const SEVERITIES = ["minor", "major", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const INCIDENT_STATUSES = ["open", "reviewing", "closed"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export interface Incident {
  id: string;
  kind: IncidentKind;
  officialId: string;
  officialName: string;
  countryCode: string;
  fixtureId: string | null;
  severity: Severity;
  status: IncidentStatus;
  description: string;
  /** 1 / 0 from the database, null while nobody has said. */
  justified: number | null;
  reportedAt: string;
  closedAt: string | null;
}

export interface IncidentBody {
  kind: IncidentKind;
  officialId?: string;
  fixtureId?: string;
  severity: Severity;
  description: string;
  justified?: boolean;
}

export const listIncidents = (query: { status?: IncidentStatus; country?: string; officialId?: string } = {}, signal?: AbortSignal) =>
  api<{ incidents: Incident[] }>("/incidents", { query: { ...query }, signal }).then((r) => r.incidents);

export const reportIncident = (body: IncidentBody) =>
  api<{ incident: Pick<Incident, "id" | "kind" | "officialId" | "status"> }>("/incidents", { method: "POST", body }).then((r) => r.incident);

export const updateIncident = (id: string, body: { status?: IncidentStatus; justified?: boolean; severity?: Severity }) =>
  api<{ ok: true }>(`/incidents/${encodeURIComponent(id)}`, { method: "PATCH", body });

export const CASE_STATUSES = ["opened", "hearing_scheduled", "decided", "appealed", "closed"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];
export const SANCTIONS = ["none", "warning", "suspension", "removal"] as const;
export type Sanction = (typeof SANCTIONS)[number];

export interface DisciplinaryCase {
  id: string;
  officialId: string;
  officialName: string;
  countryCode: string;
  incidentId: string | null;
  status: CaseStatus;
  summary: string;
  hearingAt: string | null;
  decision: string | null;
  decisionRef: string | null;
  sanction: Sanction | null;
  suspensionFrom: string | null;
  suspensionTo: string | null;
  appealNote: string | null;
  openedAt: string;
  decidedAt: string | null;
}

export interface DecideBody {
  sanction: Sanction;
  decision: string;
  decisionRef?: string;
  suspensionFrom?: string;
  suspensionTo?: string;
}

export interface AffectedDesignation {
  fixtureId: string;
  date: string;
  home: string;
  away: string;
  role: string;
}

const casePath = (id: string, rest: string) => `/cases/${encodeURIComponent(id)}${rest}`;

export const listCases = (query: { status?: CaseStatus; country?: string; officialId?: string } = {}, signal?: AbortSignal) =>
  api<{ cases: DisciplinaryCase[] }>("/cases", { query: { ...query }, signal }).then((r) => r.cases);

export const openCase = (body: { officialId: string; incidentId?: string; summary: string }) =>
  api<{ case: DisciplinaryCase }>("/cases", { method: "POST", body }).then((r) => r.case);

export const scheduleHearing = (id: string, hearingAt: string) =>
  api<{ case: DisciplinaryCase }>(casePath(id, "/hearing"), { method: "POST", body: { hearingAt } }).then((r) => r.case);

export const decideCase = (id: string, body: DecideBody) =>
  api<{ case: DisciplinaryCase; affectedDesignations: AffectedDesignation[]; statusChanges: Array<{ officialId: string; to: string }> }>(casePath(id, "/decide"), {
    method: "POST",
    body,
  });

export const appealCase = (id: string, note: string) =>
  api<{ case: DisciplinaryCase }>(casePath(id, "/appeal"), { method: "POST", body: { note } }).then((r) => r.case);

export const closeCase = (id: string, note: string) =>
  api<{ case: DisciplinaryCase }>(casePath(id, "/close"), { method: "POST", body: { note } }).then((r) => r.case);
