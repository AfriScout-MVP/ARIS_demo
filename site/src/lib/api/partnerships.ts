// The partnership pipeline (`/api/v1/partnerships`, administrators only). See api/src/routes/partnerships.ts.

import { api } from "./client";
import type { UiLocale } from "./admin";

export const STAGES = ["prospect", "contacted", "negotiating", "on_hold", "agreement_signed", "onboarded", "declined"] as const;
export type Stage = (typeof STAGES)[number];
export type Priority = "low" | "normal" | "high";
export type EventKind = "note" | "call" | "email" | "meeting" | "stage";

export interface Partnership {
  id: string;
  country: string;
  countryName: string;
  countryNameFr: string;
  flag: string;
  zone: string;
  countryActive: boolean;
  federationName: string;
  federationCode: string | null;
  stage: Stage;
  priority: Priority;
  contactName: string | null;
  contactRole: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  ownerId: string | null;
  ownerName: string | null;
  nextStep: string | null;
  nextStepDue: string | null;
  officialsEstimate: number | null;
  agreementReference: string | null;
  agreementSignedOn: string | null;
  declinedReason: string | null;
  federationId: string | null;
  createdAt: string;
  updatedAt: string;
  lastContactOn: string | null;
  events: number;
  overdue: boolean;
}

export interface PartnershipEvent {
  id: number;
  kind: EventKind;
  body: string | null;
  fromStage: Stage | null;
  toStage: Stage | null;
  occurredOn: string;
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
}

export type StageTotals = Record<Stage, { count: number; officials: number }>;

export interface PartnershipDetails {
  federationName: string;
  federationCode: string | null;
  priority: Priority;
  contactName: string | null;
  contactRole: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  ownerId: string | null;
  nextStep: string | null;
  nextStepDue: string | null;
  officialsEstimate: number | null;
}

export type CreatePartnershipBody = PartnershipDetails & { country: string; note?: string };

export interface StageBody {
  stage: Stage;
  reason?: string;
  agreementReference?: string;
  agreementSignedOn?: string;
}

export interface EventBody {
  kind: Exclude<EventKind, "stage">;
  body: string;
  occurredOn?: string;
  nextStep?: string | null;
  nextStepDue?: string | null;
}

export interface OnboardBody {
  code?: string;
  name?: string;
  seat: { name: string; email: string; locale: UiLocale; password: string };
}

const path = (id: string, rest = "") => `/partnerships/${encodeURIComponent(id)}${rest}`;

export const listPartnerships = (signal?: AbortSignal) =>
  api<{ partnerships: Partnership[]; stages: StageTotals }>("/partnerships", { signal });

export const getPartnership = (id: string, signal?: AbortSignal) =>
  api<{ partnership: Partnership; events: PartnershipEvent[]; moves: Stage[] }>(path(id), { signal });

export const createPartnership = (body: CreatePartnershipBody) =>
  api<{ partnership: Partnership }>("/partnerships", { method: "POST", body }).then((r) => r.partnership);

export const patchPartnership = (id: string, body: Partial<PartnershipDetails>) =>
  api<{ partnership: Partnership }>(path(id), { method: "PATCH", body }).then((r) => r.partnership);

export const movePartnership = (id: string, body: StageBody) =>
  api<{ partnership: Partnership }>(path(id, "/stage"), { method: "POST", body }).then((r) => r.partnership);

export const logPartnershipEvent = (id: string, body: EventBody) =>
  api<{ partnership: Partnership }>(path(id, "/events"), { method: "POST", body }).then((r) => r.partnership);

export const onboardPartnership = (id: string, body: OnboardBody) =>
  api<{ partnership: Partnership; federationId: string; seatId: string }>(path(id, "/onboard"), { method: "POST", body });
