import { api } from "./client";
import type { PositioningBody } from "@/lib/matches/positioning";

/** Record a match's positioning, physical load, pressure and weather (staff of the match's country). */
export const recordPositioning = (matchId: string, officialId: string, body: PositioningBody) =>
  api<{ match: unknown }>(`/matches/${encodeURIComponent(matchId)}/officiating/${encodeURIComponent(officialId)}`, { method: "PUT", body });
