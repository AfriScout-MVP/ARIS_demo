// Observer reports, licences, fitness tests, courses and dossiers, plus the "what stands
// between this referee and the next level" check. Empty until `applySnapshot` fills them.

import { daysBetween } from "./dates";
import { today } from "./clock";
import type { Assessment, Course, Criterion, Dossier, FitnessTest, Licence, Referee, RefereeLevel } from "./types";

export const assessments: Assessment[] = [];
export const assessmentByMatch = new Map<string, Assessment>();
export const licences: Licence[] = [];
export const fitnessTests: FitnessTest[] = [];
export const fitnessByReferee = new Map<string, FitnessTest>();
export const courses: Course[] = [];
export const dossiers: Dossier[] = [];
export const criteria: Criterion[] = [];

export function licenceStatus(licence: Licence) {
  const days = daysBetween(today(), licence.expires);
  if (days < 0) return { state: "expired" as const, days };
  if (days <= 90) return { state: "expiring" as const, days };
  return { state: "valid" as const, days };
}

export interface Requirement {
  /** The label is UI copy: `t("referees.req.<id>")`. */
  id: "arps" | "fitness" | "var" | "observer" | "matches";
  met: boolean;
  value: string;
}

const NEXT_LEVEL: Record<RefereeLevel, RefereeLevel | null> = {
  Regional: "National D1",
  "National D1": "FIFA Listed",
  "FIFA Listed": "CAF Elite",
  "CAF Elite": null,
};

/** What stands between a referee and the next level up. */
export function progressionFor(referee: Referee) {
  const fitness = fitnessByReferee.get(referee.id);
  const fitnessOk = Boolean(fitness && fitness.test1.result === "passed" && fitness.test2.result === "passed");
  const varLicence = licences.find((l) => l.refereeId === referee.id && l.kind === "VAR Certification");
  const filed = assessments.filter((a) => a.refereeId === referee.id && a.state === "filed").length;
  const requirements: Requirement[] = [
    { id: "arps", met: referee.arps >= 85, value: referee.arps.toFixed(1) },
    { id: "fitness", met: fitnessOk, value: fitnessOk ? "OK" : "—" },
    { id: "var", met: Boolean(varLicence), value: varLicence ? varLicence.expires : "—" },
    { id: "observer", met: filed >= 3, value: `${filed}/3` },
    { id: "matches", met: referee.matches >= 80, value: String(referee.matches) },
  ];
  return { nextLevel: NEXT_LEVEL[referee.level], requirements };
}
