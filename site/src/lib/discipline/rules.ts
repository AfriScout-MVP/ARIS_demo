// What a disciplinary case allows next, and what is in force today. Pure functions: tested in test/discipline.
import type { Tone } from "@/components/ui";
import type { CaseStatus, DisciplinaryCase, Incident, IncidentStatus, Sanction, Severity } from "@/lib/api/discipline";

export const CASE_TONE: Record<CaseStatus, Tone> = {
  opened: "amber",
  hearing_scheduled: "var",
  decided: "red",
  appealed: "gold",
  closed: "neutral",
};

export const INCIDENT_TONE: Record<IncidentStatus, Tone> = { open: "amber", reviewing: "var", closed: "neutral" };
export const SEVERITY_TONE: Record<Severity, Tone> = { minor: "neutral", major: "amber", critical: "red" };
export const SANCTION_TONE: Record<Sanction, Tone> = { none: "neutral", warning: "amber", suspension: "red", removal: "red" };

export type CaseAction = "hearing" | "decide" | "appeal" | "close";

/** The moves the Worker accepts from each status (`cases.post(...)`), so no button leads to a 409. */
export function caseActions(status: CaseStatus): CaseAction[] {
  switch (status) {
    case "opened":
    case "hearing_scheduled":
      return ["hearing", "decide", "close"];
    case "decided":
      return ["appeal", "close"];
    case "appealed":
      return ["decide", "close"];
    default:
      return [];
  }
}

export const isActiveCase = (c: Pick<DisciplinaryCase, "status">) => c.status !== "closed" && c.status !== "decided";

/** A suspension the Worker counts as in force on `day` (decided or under appeal, day inside the window). */
export function suspendedOn(c: Pick<DisciplinaryCase, "sanction" | "status" | "suspensionFrom" | "suspensionTo">, day: string) {
  return (
    c.sanction === "suspension" &&
    (c.status === "decided" || c.status === "appealed") &&
    c.suspensionFrom !== null &&
    c.suspensionTo !== null &&
    c.suspensionFrom <= day &&
    day <= c.suspensionTo
  );
}

/** Closing lifts a suspension that is running or still to come — the dialog must say so first. */
export function closingLiftsSuspension(c: Pick<DisciplinaryCase, "sanction" | "status" | "suspensionTo">, day: string) {
  return c.sanction === "suspension" && (c.status === "decided" || c.status === "appealed") && c.suspensionTo !== null && c.suspensionTo >= day;
}

export function disciplineSummary(incidents: Incident[], cases: DisciplinaryCase[], day: string, horizonDays = 14) {
  const horizon = new Date(`${day}T12:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + horizonDays);
  const until = horizon.toISOString().slice(0, 10);
  const suspended = new Set(cases.filter((c) => suspendedOn(c, day)).map((c) => c.officialId));
  return {
    openIncidents: incidents.filter((i) => i.status !== "closed").length,
    activeCases: cases.filter(isActiveCase).length,
    suspended: suspended.size,
    hearings: cases.filter((c) => c.status === "hearing_scheduled" && c.hearingAt && c.hearingAt.slice(0, 10) >= day && c.hearingAt.slice(0, 10) <= until).length,
  };
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function matchesText(q: string, ...fields: Array<string | null | undefined>) {
  const needle = fold(q.trim());
  return !needle || fields.some((f) => f && fold(f).includes(needle));
}

export interface DecisionDraft {
  sanction: Sanction;
  decision: string;
  decisionRef: string;
  from: string;
  to: string;
}

export type DecisionField = "decision" | "decisionRef" | "window";

/** The same rules as the Worker's `decideSchema`, so the form says what is wrong before sending. */
export function validateDecision(d: DecisionDraft): Partial<Record<DecisionField, true>> {
  const out: Partial<Record<DecisionField, true>> = {};
  if (d.decision.trim().length < 5) out.decision = true;
  if (d.sanction === "suspension") {
    if (d.decisionRef.trim().length < 3) out.decisionRef = true;
    const day = /^\d{4}-\d{2}-\d{2}$/;
    if (!day.test(d.from) || !day.test(d.to) || d.to < d.from) out.window = true;
  }
  return out;
}
