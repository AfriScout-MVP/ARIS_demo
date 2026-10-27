import { api } from "./client";
import { API_BASE } from "./config";

/* The staff dashboards (`/reports/*`). A federation seat is always confined to its own country; an administrator may narrow to one. */

export interface Range {
  from: string;
  to: string;
  /** Administrators only. */
  country?: string;
}

export interface Overview {
  asOf: string;
  country: string | null;
  workforce: {
    referees: number | null;
    assistants: number | null;
    active: number | null;
    suspended: number | null;
    training: number | null;
    availableToday: number;
    byLevel: Array<{ level: string; n: number }>;
  };
  designations: { slots: Record<string, number>; fixturesByStatus: Record<string, number> };
  budget: Array<{ currency: string; planned: number | null; committed: number | null; paid: number | null; contested: number | null }>;
  performance: {
    avgRating: number | null;
    avgArps: number | null;
    top: RankedOfficial[];
    bottom: RankedOfficial[];
  };
  compliance: { licencesExpired: number; licencesExpiring90: number; fitnessFailed: number; assessmentsOverdue: number };
}

export interface RankedOfficial {
  id: string;
  name: string;
  countryCode: string;
  rating: number;
  trend: number;
}

export interface WorkloadRow {
  officialId: string;
  name: string;
  countryCode: string;
  kind: "referee" | "assistant";
  status: string;
  appointments: number;
  asReferee: number;
  lastDate: string | null;
  nextDate: string | null;
  flag: "overused" | "unused" | null;
}

export interface Workload {
  from: string;
  to: string;
  mean: number;
  rows: WorkloadRow[];
}

export interface Absences {
  from: string;
  to: string;
  incidents: Array<{ kind: string; status: string; n: number }>;
  refusals: number;
  replacements: number;
  sanctions: Array<{ sanction: string; n: number }>;
}

export const FEE_GROUPS = ["official", "competition", "city", "day"] as const;
export type FeeGroup = (typeof FEE_GROUPS)[number];

export interface FeeRow {
  key: string;
  currency: string;
  lines: number;
  total: number;
  paid: number;
  validated: number;
  due: number;
  contested: number;
}

export type ReconciliationIssue = "played-not-billed" | "paid-not-played" | "paid-unvalidated";

export interface IssueRow {
  fixtureId: string;
  date: string;
  home: string;
  away: string;
  fixtureStatus: string;
  role: string;
  officialName: string;
  countryCode: string;
  designation: string;
  payment: string | null;
  total: number | null;
  currency: string | null;
  issue: ReconciliationIssue;
}

const q = (r: Range) => ({ from: r.from, to: r.to, country: r.country });

export const getOverview = (country: string | undefined, signal?: AbortSignal) => api<Overview>("/reports/overview", { query: { country }, signal });
export const getWorkload = (r: Range, signal?: AbortSignal) => api<Workload>("/reports/workload", { query: q(r), signal });
export const getAbsences = (r: Range, signal?: AbortSignal) => api<Absences>("/reports/absences", { query: q(r), signal });
export const getFees = (r: Range, groupBy: FeeGroup, signal?: AbortSignal) =>
  api<{ rows: FeeRow[]; groupBy: FeeGroup }>("/reports/fees", { query: { ...q(r), groupBy }, signal }).then((x) => x.rows);
export const getReconciliation = (r: Range, signal?: AbortSignal) =>
  api<{ checked: number; issues: IssueRow[] }>("/reports/reconciliation", { query: q(r), signal });

/** The same report as a spreadsheet: the Worker answers with an attachment; the browser sends the session cookie. */
export function csvHref(report: "workload" | "absences" | "fees" | "reconciliation", r: Range, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({ from: r.from, to: r.to, format: "csv", ...(r.country ? { country: r.country } : {}), ...extra });
  return `${API_BASE}/api/v1/reports/${report}?${params.toString()}`;
}
