import { api } from "./client";

/* Competitions and their seasons. A federation manages its own country's; an administrator any, CAF's included. */

export const COMPETITION_TIERS = ["d1", "d2", "cup", "continental"] as const;
export type CompetitionTier = (typeof COMPETITION_TIERS)[number];

export interface CompetitionRow {
  id: string;
  countryCode: string;
  name: string;
  shortName: string | null;
  tier: CompetitionTier;
  gender: "M" | "W";
  season: string;
  matchdays: number;
  currentMatchday: number;
  varEnabled: boolean;
  weight: number;
  isActive: boolean;
}

export interface CompetitionBody {
  countryCode?: string;
  name: string;
  shortName?: string | null;
  tier: CompetitionTier;
  gender: "M" | "W";
  season: string;
  matchdays: number;
  currentMatchday: number;
  varEnabled: boolean;
  weight: number;
  isActive: boolean;
}

export type CompetitionPatch = Partial<Pick<CompetitionBody, "name" | "shortName" | "tier" | "matchdays" | "currentMatchday" | "varEnabled" | "weight" | "isActive">>;

export const listCompetitions = (country: string | undefined, signal?: AbortSignal) =>
  api<{ competitions: CompetitionRow[] }>("/competitions", { query: { country }, signal }).then((r) => r.competitions);

export const createCompetition = (body: CompetitionBody) =>
  api<{ competition: CompetitionRow }>("/competitions", { method: "POST", body }).then((r) => r.competition);

export const updateCompetition = (id: string, body: CompetitionPatch) =>
  api<{ competition: CompetitionRow }>(`/competitions/${encodeURIComponent(id)}`, { method: "PATCH", body }).then((r) => r.competition);
