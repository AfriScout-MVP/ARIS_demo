// The pipeline's vocabulary and form rules, as pure functions. The server enforces the same rules
// (api/src/routes/partnerships.ts); these only decide what the screen offers and say what is missing.

import type { Tone } from "@/components/ui";
import type { TKey } from "@/locales";
import type { Partnership, PartnershipDetails, Priority, Stage } from "@/lib/api/partnerships";
import { isEmail, isFederationCode, isFilled, normalizeCode } from "@/lib/admin/validators";
import type { FormErrors } from "@/lib/admin/forms";

/** The stages a relationship is still being worked in, in the order the board shows them. */
export const BOARD_STAGES: Stage[] = ["prospect", "contacted", "negotiating", "agreement_signed"];
export const OPEN_STAGES: Stage[] = ["prospect", "contacted", "negotiating", "on_hold"];

export const stageKey = (stage: Stage): TKey => `partnerships.stages.${stage}`;
export const priorityKey = (priority: Priority): TKey => `partnerships.priorities.${priority}`;

export const STAGE_TONE: Record<Stage, Tone> = {
  prospect: "neutral",
  contacted: "var",
  negotiating: "amber",
  on_hold: "neutral",
  agreement_signed: "gold",
  onboarded: "pitch",
  declined: "red",
};

export const PRIORITY_TONE: Record<Priority, Tone> = { high: "red", normal: "neutral", low: "chalk" };

/** Still on the table: everything but onboarded and declined. */
export const isLive = (stage: Stage) => stage !== "onboarded" && stage !== "declined";

/** Days from `today` to an ISO date (negative when it is past). */
export function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
}

export interface PipelineFilter {
  q: string;
  stage: Stage | "live" | "all";
  mine: string | null;
}

/** What the list shows: text match on federation, code, country and contact; a stage or "still live"; optionally one owner. */
export function filterPartnerships(rows: Partnership[], f: PipelineFilter): Partnership[] {
  const needle = f.q.trim().toLowerCase();
  return rows.filter((p) => {
    if (f.stage === "live" ? !isLive(p.stage) : f.stage !== "all" && p.stage !== f.stage) return false;
    if (f.mine && p.ownerId !== f.mine) return false;
    if (!needle) return true;
    return [p.federationName, p.federationCode, p.country, p.countryName, p.countryNameFr, p.contactName, p.contactEmail]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(needle));
  });
}

/** The headline numbers above the board. */
export function pipelineSummary(rows: Partnership[]) {
  const live = rows.filter((p) => isLive(p.stage));
  return {
    live: live.length,
    overdue: live.filter((p) => p.overdue).length,
    signed: rows.filter((p) => p.stage === "agreement_signed").length,
    onboarded: rows.filter((p) => p.stage === "onboarded").length,
    /** Officials the live relationships would bring onto ARIS. */
    officialsInPlay: live.reduce((n, p) => n + (p.officialsEstimate ?? 0), 0),
  };
}

// -------------------------------------------------------------------- forms

export interface DetailsValues {
  country: string;
  federationName: string;
  federationCode: string;
  priority: Priority;
  contactName: string;
  contactRole: string;
  contactEmail: string;
  contactPhone: string;
  ownerId: string;
  nextStep: string;
  nextStepDue: string;
  officialsEstimate: string;
  note: string;
}

export type DetailsField = "country" | "federationName" | "federationCode" | "contactEmail" | "contactPhone" | "nextStepDue" | "officialsEstimate";

const REQUIRED: TKey = "admin.errors.required";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PHONE = /^\+?[0-9 ()-]{6,30}$/;

export function emptyDetails(ownerId: string): DetailsValues {
  return {
    country: "", federationName: "", federationCode: "", priority: "normal", contactName: "", contactRole: "", contactEmail: "",
    contactPhone: "", ownerId, nextStep: "", nextStepDue: "", officialsEstimate: "", note: "",
  };
}

export function detailsFrom(p: Partnership): DetailsValues {
  return {
    country: p.country,
    federationName: p.federationName,
    federationCode: p.federationCode ?? "",
    priority: p.priority,
    contactName: p.contactName ?? "",
    contactRole: p.contactRole ?? "",
    contactEmail: p.contactEmail ?? "",
    contactPhone: p.contactPhone ?? "",
    ownerId: p.ownerId ?? "",
    nextStep: p.nextStep ?? "",
    nextStepDue: p.nextStepDue ?? "",
    officialsEstimate: p.officialsEstimate === null ? "" : String(p.officialsEstimate),
    note: "",
  };
}

export function validateDetails(v: DetailsValues, mode: "create" | "edit"): FormErrors<DetailsField> {
  const e: FormErrors<DetailsField> = {};
  if (mode === "create" && !v.country) e.country = "admin.errors.pickCountry";
  if (!isFilled(v.federationName)) e.federationName = REQUIRED;
  else if (v.federationName.trim().length < 2 || v.federationName.trim().length > 160) e.federationName = "admin.errors.tooLong";
  if (isFilled(v.federationCode) && !isFederationCode(normalizeCode(v.federationCode))) e.federationCode = "admin.errors.federationCode";
  if (isFilled(v.contactEmail) && !isEmail(v.contactEmail)) e.contactEmail = "admin.errors.emailInvalid";
  if (isFilled(v.contactPhone) && !PHONE.test(v.contactPhone.trim())) e.contactPhone = "partnerships.errors.phone";
  if (isFilled(v.nextStepDue) && !DATE.test(v.nextStepDue)) e.nextStepDue = "admin.errors.fieldInvalid";
  if (isFilled(v.officialsEstimate) && !/^\d{1,6}$/.test(v.officialsEstimate.trim())) e.officialsEstimate = "admin.errors.fieldInvalid";
  return e;
}

const orNull = (s: string) => (s.trim() ? s.trim() : null);

export function toDetailsBody(v: DetailsValues): PartnershipDetails {
  return {
    federationName: v.federationName.trim(),
    federationCode: isFilled(v.federationCode) ? normalizeCode(v.federationCode) : null,
    priority: v.priority,
    contactName: orNull(v.contactName),
    contactRole: orNull(v.contactRole),
    contactEmail: orNull(v.contactEmail)?.toLowerCase() ?? null,
    contactPhone: orNull(v.contactPhone),
    ownerId: v.ownerId || null,
    nextStep: orNull(v.nextStep),
    nextStepDue: orNull(v.nextStepDue),
    officialsEstimate: isFilled(v.officialsEstimate) ? Number(v.officialsEstimate.trim()) : null,
  };
}

/** Only what changed, so an edit does not rewrite (and audit) fields nobody touched. */
export function detailsPatch(before: Partnership, v: DetailsValues): Partial<PartnershipDetails> {
  const next = toDetailsBody(v);
  const out: Partial<PartnershipDetails> = {};
  for (const key of Object.keys(next) as Array<keyof PartnershipDetails>) {
    if (next[key] !== before[key]) (out as Record<string, unknown>)[key] = next[key];
  }
  return out;
}
