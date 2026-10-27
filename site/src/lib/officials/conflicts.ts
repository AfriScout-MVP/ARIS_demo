import type { TKey } from "@/locales";

/* Declared conflicts of interest. The engine keeps an official off a match that involves the club or team
 * (matched on its name as the calendar spells it) or the country (matched on its code). Pure. */

export const CONFLICT_KINDS = ["club", "team", "country"] as const;
export type ConflictKind = (typeof CONFLICT_KINDS)[number];

export interface ConflictValues {
  kind: ConflictKind;
  subject: string;
  note: string;
}

export type ConflictErrors = Partial<Record<keyof ConflictValues, TKey>>;

export const emptyConflict = (): ConflictValues => ({ kind: "club", subject: "", note: "" });

export function validateConflict(v: ConflictValues, existing: Array<{ kind: string; subject: string }>): ConflictErrors {
  const e: ConflictErrors = {};
  const subject = v.subject.trim();
  if (v.kind === "country") {
    if (!/^[A-Za-z]{3}$/.test(subject)) e.subject = "officials.conflicts.errors.country";
  } else if (subject.length < 2 || subject.length > 80) e.subject = "officials.conflicts.errors.subject";
  if (!e.subject && existing.some((c) => c.kind === v.kind && c.subject.toLowerCase() === subject.toLowerCase())) {
    e.subject = "officials.conflicts.errors.duplicate";
  }
  if (v.note.trim().length > 300) e.note = "officials.conflicts.errors.note";
  return e;
}

export const toConflictBody = (v: ConflictValues) => ({
  kind: v.kind,
  subject: v.kind === "country" ? v.subject.trim().toUpperCase() : v.subject.trim(),
  ...(v.note.trim() ? { note: v.note.trim() } : {}),
});
