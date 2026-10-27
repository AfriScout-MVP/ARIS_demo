import { api } from "./client";

/* Payments, fee scales and advances — the money side of a designation. Staff only, except where noted. */

export const CREW_ROLES = ["R", "AR1", "AR2", "FOURTH", "VAR", "AVAR", "OBS"] as const;
export type CrewRole = (typeof CREW_ROLES)[number];

export const TIERS = ["d1", "d2", "cup", "continental"] as const;
export type Tier = (typeof TIERS)[number];

export const PAYMENT_STATUSES = ["due", "validated", "paid", "contested", "cancelled"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const ADVANCE_STATUSES = ["requested", "approved", "paid", "settled", "rejected"] as const;
export type AdvanceStatus = (typeof ADVANCE_STATUSES)[number];

export interface Payment {
  id: string;
  fixtureId: string;
  role: CrewRole;
  officialId: string;
  officialName: string;
  /** The country paying the line — the one running the fixture ('CAF' for a continental tie). */
  countryCode: string;
  /** The official's own country; differs from `countryCode` for a neutral official from abroad. */
  officialCountryCode: string;
  base: number;
  transport: number;
  lodging: number;
  meals: number;
  bonus: number;
  deduction: number;
  total: number;
  currency: string;
  status: PaymentStatus;
  presenceConfirmed: boolean;
  matchValidated: boolean;
  expensesVerified: boolean;
  validatedAt: string | null;
  paidAt: string | null;
  paymentRef: string | null;
  contestNote: string | null;
  createdAt: string;
  home: string;
  away: string;
  date: string;
  kickoffAt: string;
  city: string | null;
  competitionId: string;
}

export interface Receipt {
  id: string;
  kind: string;
  status: string;
  mediaId: string;
  filename: string;
  contentType: string;
  createdAt: string;
  url: string;
}

export interface PaymentQuery {
  status?: PaymentStatus;
  officialId?: string;
  fixtureId?: string;
  country?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface GenerateResult {
  created: number;
  /** Roles with no scale at all. */
  missingScale: CrewRole[];
  /** Roles whose only scales are written in another currency. */
  currencyMismatch: CrewRole[];
  /** Roles priced from the platform default because the federation has no scale of its own. */
  defaultScaleUsed: CrewRole[];
  /** Roles whose cancelled line (left by a replaced official) was issued afresh to the one holding the slot now. */
  reissued: CrewRole[];
  /** Roles whose line is still open or paid in the name of an official who no longer holds the slot. */
  heldByPrevious: CrewRole[];
}

export type MoneyField = "transport" | "lodging" | "meals" | "bonus" | "deduction";
export type CheckField = "presenceConfirmed" | "matchValidated" | "expensesVerified";
export type AdjustBody = Partial<Record<MoneyField, number> & Record<CheckField, boolean>> & { reason?: string };

const paymentPath = (id: string, rest = "") => `/payments/${encodeURIComponent(id)}${rest}`;

export const listPayments = (query: PaymentQuery = {}, signal?: AbortSignal) =>
  api<{ payments: Payment[] }>("/payments", { query: { ...query }, signal }).then((r) => r.payments);

export const getPayment = (id: string, signal?: AbortSignal) =>
  api<{ payment: Payment & { receipts: Receipt[] } }>(paymentPath(id), { signal }).then((r) => r.payment);

export const generatePayments = (fixtureId: string) =>
  api<GenerateResult>("/payments/generate", { method: "POST", body: { fixtureId } });

export const adjustPayment = (id: string, body: AdjustBody) =>
  api<{ payment: Payment }>(paymentPath(id), { method: "PATCH", body }).then((r) => r.payment);

export const validatePayment = (id: string) =>
  api<{ payment: Payment }>(paymentPath(id, "/validate"), { method: "POST" }).then((r) => r.payment);

export const payPayment = (id: string, reference: string) =>
  api<{ payment: Payment }>(paymentPath(id, "/pay"), { method: "POST", body: { reference } }).then((r) => r.payment);

export const resolvePayment = (id: string, outcome: "due" | "cancelled", note: string) =>
  api<{ payment: Payment }>(paymentPath(id, "/resolve"), { method: "POST", body: { outcome, note } }).then((r) => r.payment);

export const cancelPayment = (id: string, note: string) =>
  api<{ payment: Payment }>(paymentPath(id, "/cancel"), { method: "POST", body: { note } }).then((r) => r.payment);

/** The official's own dispute (the referee space). */
export const contestPayment = (id: string, note: string) =>
  api<{ payment: Payment }>(paymentPath(id, "/contest"), { method: "POST", body: { note } }).then((r) => r.payment);

/* ------------------------------------------------------------ fee scales */

export interface FeeScale {
  id: string;
  tier: Tier;
  competitionId: string | null;
  /** null = the platform default. */
  federationId: string | null;
  federationCode: string | null;
  role: CrewRole;
  amount: number;
  transport: number;
  lodging: number;
  meals: number;
  currency: string;
  effectiveFrom: string | null;
  /** A federation seat reads the platform defaults but cannot change them. */
  readonly: boolean;
}

export interface ScaleBody {
  federationId?: string | null;
  tier: Tier;
  competitionId: string | null;
  role: CrewRole;
  amount: number;
  transport: number;
  lodging: number;
  meals: number;
  currency?: string;
}

/** `federationId`: an id, "default" for the platform rows, or nothing for every row the caller may read. */
export const listScales = (federationId?: string, signal?: AbortSignal) =>
  api<{ scales: FeeScale[] }>("/fee-scales", { query: { federationId }, signal }).then((r) => r.scales);

export const saveScale = (body: ScaleBody) => api<{ ok: true; federationId: string | null }>("/fee-scales", { method: "PUT", body });

/* -------------------------------------------------------------- advances */

export interface Advance {
  id: string;
  officialId: string;
  officialName: string;
  countryCode: string;
  fixtureId: string | null;
  amount: number;
  currency: string;
  justification: string;
  status: AdvanceStatus;
  requestedAt: string;
  decidedAt: string | null;
}

export interface AdvanceBody {
  /** Staff only: the official it is for. A referee always asks for themselves. */
  officialId?: string;
  fixtureId?: string;
  amount: number;
  justification: string;
}

export const listAdvances = (query: { status?: AdvanceStatus; country?: string } = {}, signal?: AbortSignal) =>
  api<{ advances: Advance[] }>("/advances", { query: { ...query }, signal }).then((r) => r.advances);

export const requestAdvance = (body: AdvanceBody) =>
  api<{ advance: Pick<Advance, "id" | "officialId" | "amount" | "status"> }>("/advances", { method: "POST", body }).then((r) => r.advance);

export const decideAdvance = (id: string, status: Exclude<AdvanceStatus, "requested">) =>
  api<{ ok: true; status: AdvanceStatus }>(`/advances/${encodeURIComponent(id)}/decide`, { method: "POST", body: { status } });
