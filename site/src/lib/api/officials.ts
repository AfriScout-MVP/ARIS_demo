import { api } from "./client";
import { API_BASE } from "./config";
import { uploadFile } from "./upload";
import type { Localized } from "@/lib/store/types";

/* The register: an official's file as the federation keeps it, and the documents attached to it. */

export const OFFICIAL_LEVELS = ["CAF Elite", "FIFA Listed", "National D1", "Regional"] as const;
export type OfficialLevel = (typeof OFFICIAL_LEVELS)[number];

/** What an edit may set. `suspended` only ever comes from a disciplinary decision. */
export const EDITABLE_STATUSES = ["active", "training", "elite-pool", "unavailable", "retired"] as const;
export type EditableStatus = (typeof EDITABLE_STATUSES)[number];
export type OfficialStatus = EditableStatus | "suspended";

export const DISCIPLINES = ["football", "futsal", "football7"] as const;
export type Discipline = (typeof DISCIPLINES)[number];

export const DOC_KINDS = ["licence", "identity", "medical", "certificate", "attestation", "receipt", "photo", "other"] as const;
export type DocKind = (typeof DOC_KINDS)[number];
export type DocStatus = "pending" | "verified" | "rejected";

/** The Worker's own limits for an attached file (lib/media). */
export const DOC_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"] as const;
export const MAX_DOC_BYTES = 8 * 1024 * 1024;

export interface OfficialFile {
  id: string;
  kind: "referee" | "assistant";
  name: string;
  initials: string;
  photoUrl: string | null;
  countryCode: string;
  city: string;
  level: OfficialLevel;
  status: OfficialStatus;
  yearsActive: number;
  varQualified: boolean;
  bio: Localized;
  region: string | null;
  league: string | null;
  nationality: string | null;
  disciplines: Discipline[];
  interventionZones: string[];
  hasPhoto: boolean;
  matricule: string | null;
  licenceNo: string | null;
  birthDate: string | null;
  email: string | null;
  phone: string | null;
  updatedAt: string;
}

export interface OfficialDocument {
  id: string;
  kind: DocKind;
  filename: string;
  contentType: string;
  size: number;
  status: DocStatus;
  expiresOn: string | null;
  createdAt: string;
  mediaId: string;
  url: string;
}

export interface Conflict {
  id: string;
  kind: "club" | "team" | "country";
  subject: string;
  note: string | null;
  declaredAt: string;
}

export interface OfficialDetail {
  official: OfficialFile;
  licences: Array<{ id: string; kind: string; issued: string; expires: string }>;
  documents: OfficialDocument[];
  conflicts: Conflict[];
}

export interface OfficialQuery {
  kind?: "referee" | "assistant";
  country?: string;
  status?: string;
  q?: string;
  limit?: number;
}

export interface CreateOfficialBody {
  kind: "referee" | "assistant";
  name: string;
  countryCode?: string;
  level: OfficialLevel;
  status?: EditableStatus;
  matricule?: string;
  licenceNo?: string;
  nationality?: string;
  birthDate?: string;
  city?: string;
  region?: string;
  league?: string;
  email?: string;
  phone?: string;
  disciplines?: Discipline[];
  interventionZones?: string[];
  varQualified?: boolean;
  yearsActive?: number;
  bio?: Localized;
}

export type PatchOfficialBody = Partial<{
  name: string;
  level: OfficialLevel;
  status: EditableStatus;
  licenceNo: string | null;
  nationality: string | null;
  birthDate: string | null;
  city: string | null;
  region: string | null;
  league: string | null;
  email: string | null;
  phone: string | null;
  disciplines: Discipline[];
  interventionZones: string[];
  varQualified: boolean;
  yearsActive: number;
  bio: Localized;
}>;

/** At most 500 rows per call; the screen says so when the list is cut. */
export const OFFICIALS_PAGE = 500;

export const listOfficials = (query: OfficialQuery = {}, signal?: AbortSignal) =>
  api<{ officials: OfficialFile[] }>("/officials", { query: { limit: OFFICIALS_PAGE, ...query }, signal }).then((r) => r.officials);

export const getOfficial = (id: string, signal?: AbortSignal) =>
  api<OfficialDetail>(`/officials/${encodeURIComponent(id)}`, { signal });

export const createOfficial = (body: CreateOfficialBody) =>
  api<{ official: OfficialFile }>("/officials", { method: "POST", body }).then((r) => r.official);

export const updateOfficial = (id: string, body: PatchOfficialBody) =>
  api<{ official: OfficialFile }>(`/officials/${encodeURIComponent(id)}`, { method: "PATCH", body }).then((r) => r.official);

export const uploadDocument = (officialId: string, file: File, kind: DocKind, expiresOn?: string) =>
  uploadFile<{ document: OfficialDocument }>(
    `/officials/${encodeURIComponent(officialId)}/documents`,
    file,
    { kind, ...(expiresOn ? { expiresOn } : {}) },
    { method: "POST" },
  ).then((r) => r.document);

export const setDocumentStatus = (id: string, status: DocStatus) =>
  api<{ ok: true; status: DocStatus }>(`/documents/${encodeURIComponent(id)}/status`, { method: "PATCH", body: { status } });

export const deleteDocument = (id: string) => api<{ ok: true }>(`/documents/${encodeURIComponent(id)}`, { method: "DELETE" });

/** The file itself: the browser sends the session cookie, the Worker answers as an attachment. */
export const documentHref = (id: string) => `${API_BASE}/api/v1/documents/${encodeURIComponent(id)}`;

/** The official declares a link (or staff do it for them); only staff remove one. */
export const declareConflict = (officialId: string, body: { kind: Conflict["kind"]; subject: string; note?: string }) =>
  api<{ conflict: Pick<Conflict, "id" | "kind" | "subject"> }>(`/officials/${encodeURIComponent(officialId)}/conflicts`, { method: "POST", body }).then((r) => r.conflict);

export const removeConflict = (officialId: string, conflictId: string) =>
  api<{ ok: true }>(`/officials/${encodeURIComponent(officialId)}/conflicts/${encodeURIComponent(conflictId)}`, { method: "DELETE" });
