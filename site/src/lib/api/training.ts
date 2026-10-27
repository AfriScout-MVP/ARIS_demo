import { api } from "./client";
import type { Localized } from "@/lib/store/types";

/* Licences, fitness tests and courses — the development side of an official. Staff, except where a line says otherwise. */

export const LICENCE_KINDS = ["FIFA Badge", "CAF Elite Panel", "National D1", "VAR Certification", "Fitness Clearance"] as const;
export type LicenceKind = (typeof LICENCE_KINDS)[number];

export interface LicenceRow {
  id: string;
  officialId: string;
  officialName: string;
  countryCode: string;
  kind: LicenceKind;
  issued: string;
  expires: string;
  state: "valid" | "expiring" | "expired";
}

export const listLicences = (query: { country?: string; officialId?: string; expiringWithin?: number } = {}, signal?: AbortSignal) =>
  api<{ licences: LicenceRow[] }>("/licences", { query: { ...query }, signal }).then((r) => r.licences);

export const addLicence = (body: { officialId: string; kind: LicenceKind; issued: string; expires: string }) =>
  api<{ id: string }>("/licences", { method: "POST", body });

export const updateLicence = (id: string, body: { kind?: LicenceKind; issued?: string; expires?: string }) =>
  api<{ ok: true }>(`/licences/${encodeURIComponent(id)}`, { method: "PATCH", body });

/** Administrators only. */
export const deleteLicence = (id: string) => api<{ ok: true }>(`/licences/${encodeURIComponent(id)}`, { method: "DELETE" });

export interface FitnessBody {
  date: string;
  test1: { result: "passed" | "failed"; bestSprint: number };
  test2: { result: "passed" | "failed"; laps: number };
  retestDate: string | null;
}

export const recordFitness = (officialId: string, body: FitnessBody) =>
  api<{ ok: true; id: string }>(`/fitness/${encodeURIComponent(officialId)}`, { method: "PUT", body });

export interface FitnessEntry {
  id: string;
  date: string;
  test1: { result: "passed" | "failed"; bestSprint: number };
  test2: { result: "passed" | "failed"; laps: number };
  retestDate: string | null;
  passed: boolean;
  recordedAt: string | null;
}

export const FITNESS_PAGE = 10;

/** The official themself, their federation or an administrator. Newest first. */
export const listFitnessHistory = (officialId: string, offset = 0, signal?: AbortSignal) =>
  api<{ current: FitnessEntry | null; history: FitnessEntry[]; hasMore: boolean }>(`/officials/${encodeURIComponent(officialId)}/fitness`, {
    query: { limit: FITNESS_PAGE, offset },
    signal,
  });

export type CourseKind = "course" | "exam" | "camp";
/** Kept for older readers: the course-wide state. The enrolment's own state is what counts now. */
export type CourseState = "enrolled" | "completed" | "not-started";
export type EnrolmentState = "enrolled" | "completed" | "failed";

export interface Enrolment {
  officialId: string;
  officialName: string;
  countryCode: string;
  state: EnrolmentState;
  examScore: number | null;
  completedAt: string | null;
  enrolledAt: string | null;
  selfEnrolled: boolean;
}

export interface CourseRow {
  id: string;
  kind: CourseKind;
  name: Localized;
  provider: string;
  /** null = offered platform-wide. */
  federationId: string | null;
  hours: number;
  state: CourseState;
  startsOn: string | null;
  endsOn: string | null;
  /** Referees may sign up themselves. */
  openEnrolment: boolean;
  /** Closed instead of deleted because people were enrolled: no new enrolments. */
  closed: boolean;
  /** Enrolled officials the caller may see (a federation only sees its own). */
  officialIds: string[];
  enrolments: Enrolment[];
  /** Referees only. */
  myEnrolment?: Enrolment | null;
  canSelfEnrol?: boolean;
}

export interface CourseBody {
  federationId?: string | null;
  kind: CourseKind;
  name: { fr: string; en: string; es?: string; de?: string };
  provider: string;
  hours: number;
  startsOn?: string | null;
  endsOn?: string | null;
  openEnrolment?: boolean;
}

export const listCourses = (signal?: AbortSignal) => api<{ courses: CourseRow[] }>("/courses", { signal }).then((r) => r.courses);

export const getCourse = (id: string, signal?: AbortSignal) => api<{ course: CourseRow }>(`/courses/${encodeURIComponent(id)}`, { signal }).then((r) => r.course);

export const createCourse = (body: CourseBody) => api<{ id: string; federationId: string | null }>("/courses", { method: "POST", body });

export const updateCourse = (id: string, body: Partial<Omit<CourseBody, "federationId">>) =>
  api<{ ok: true; changed: boolean }>(`/courses/${encodeURIComponent(id)}`, { method: "PATCH", body });

/** Deleted when nobody was ever enrolled, otherwise closed. */
export const deleteCourse = (id: string) => api<{ ok: true; deleted: boolean; closed: boolean }>(`/courses/${encodeURIComponent(id)}`, { method: "DELETE" });

export const enrolOfficials = (id: string, officialIds: string[]) =>
  api<{ ok: true; enrolled: number }>(`/courses/${encodeURIComponent(id)}/enrol`, { method: "POST", body: { officialIds } });

export const unenrolOfficials = (id: string, officialIds: string[]) =>
  api<{ ok: true; removed: number; kept: number }>(`/courses/${encodeURIComponent(id)}/unenrol`, { method: "POST", body: { officialIds } });

export const completeOfficials = (id: string, officialIds: string[]) =>
  api<{ ok: true; completed: number }>(`/courses/${encodeURIComponent(id)}/complete`, { method: "POST", body: { officialIds } });

export const setEnrolmentResult = (id: string, officialId: string, body: { state?: EnrolmentState; examScore?: number | null }) =>
  api<{ ok: true }>(`/courses/${encodeURIComponent(id)}/enrolments/${encodeURIComponent(officialId)}`, { method: "PATCH", body });

/** Referees: join an open course, or leave one they joined themselves. */
export const selfEnrol = (id: string) => api<{ ok: true; enrolled: boolean }>(`/courses/${encodeURIComponent(id)}/enrolment`, { method: "POST" });
export const selfUnenrol = (id: string) => api<{ ok: true }>(`/courses/${encodeURIComponent(id)}/enrolment`, { method: "DELETE" });
