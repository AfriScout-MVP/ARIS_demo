// Shapes of the data ARIS holds in memory. Every one of them comes from the API
// (`GET /api/v1/snapshot`, see api/docs/api-contract.md) — nothing is built in the browser.

import type {
  AvailabilityState,
  CrewRole,
  CrewSlot,
  Fixture as CoreFixture,
  SlotState,
  Zone,
} from "@/lib/core/types";
import { crewRoles } from "@/lib/core/types";

export type { AvailabilityState, CrewRole, CrewSlot, SlotState, Zone };
export { crewRoles };

/** Copy stored in the database in several languages. French and English are always present. */
export type Localized = { fr: string; en: string; es?: string; de?: string };

/**
 * Data freshness of a country, derived by the API from its latest fixture / crew / match / report change:
 * "healthy" within the API's threshold (7 days), "stale" after it, "none" when the country has no data at all.
 */
export type SyncHealth = "healthy" | "stale" | "none";

export interface Country {
  code: string;
  iso2: string;
  name: string;
  nameFr: string;
  nameEs: string;
  nameDe: string;
  /** Emoji flag — the fallback when there is no uploaded image. */
  flag: string;
  /** `/api/v1/media/<id>` (public), or null. */
  flagUrl: string | null;
  /** Federation code, e.g. "FSF". */
  federation: string;
  federationName: string;
  zone: Zone;
  capital: string;
  timezone: string;
  currency: string;
  active: boolean;
  syncSource: "COMET" | "League feed" | "Manual entry";
  syncHealth: SyncHealth;
  /** Hours since the latest change to the country's data; null when there is none. */
  lastSyncHours: number | null;
  lastActivityAt?: string | null;
  /** The club teams of the country. */
  clubs: string[];
}

export type CompetitionTier = "d1" | "d2" | "cup" | "continental";

export interface Competition {
  id: string;
  countryCode: string;
  name: string;
  tier: CompetitionTier;
  gender: "M" | "W";
  matchdays: number;
  currentMatchday: number;
  varEnabled: boolean;
  /** Weight used for fixture importance. */
  weight: number;
  /** Sent by the Worker; optional for older responses. */
  season?: string;
  shortName?: string | null;
  isActive?: boolean;
}

/** `retired` officials stay in the register but never reach the snapshot. */
export type RefereeStatus = "active" | "suspended" | "training" | "elite-pool" | "unavailable";
export type RefereeLevel = "CAF Elite" | "FIFA Listed" | "National D1" | "Regional";

export interface Referee {
  id: string;
  name: string;
  initials: string;
  /** Private media URL (the browser sends its cookie), or null. */
  photoUrl: string | null;
  countryCode: string;
  city: string;
  level: RefereeLevel;
  age: number;
  yearsActive: number;
  status: RefereeStatus;
  arps: number;
  rmcsAvg: number;
  fitness: number;
  matches: number;
  cards: { yellow: number; red: number };
  varAccuracy: number;
  varQualified: boolean;
  trend: number;
  bio: Localized;
}

/** Assistant referees and fourth officials — the wider list a federation draws on. */
export interface Assistant {
  id: string;
  name: string;
  initials: string;
  photoUrl: string | null;
  countryCode: string;
  level: "FIFA Listed" | "National D1" | "Regional";
  rating: number;
}

export interface OfficialRef {
  id: string;
  name: string;
  initials: string;
  photoUrl: string | null;
  countryCode: string;
  kind: "referee" | "assistant";
}

export type FixtureStatus = "scheduled" | "played" | "postponed" | "cancelled";
export type DesignationStatus = "draft" | "awaiting_confirmation" | "validated" | "published";

/** A fixture as the API returns it: the shared engine's `Fixture` plus the workflow state. */
export interface Fixture extends CoreFixture {
  /** UTC kick-off; `date` and `kickoff` are the local values at the venue. */
  kickoffAt: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  /** Nation codes on continental ties, null otherwise. */
  homeCode: string | null;
  awayCode: string | null;
  designationStatus: DesignationStatus;
  status: FixtureStatus;
  /** Sent by the Worker; optional for older responses. */
  stadiumId?: string | null;
  roundLabel?: string | null;
  timezone?: string;
}

/**
 * A fixture on the wire. The workflow fields are optional here because `normalizeFixture`
 * fills them in; everything the screens read goes through the full `Fixture`.
 */
export type ApiFixture = CoreFixture & Partial<Omit<Fixture, keyof CoreFixture>>;

export interface MatchDecision {
  id: string;
  minute: number;
  /** One of the referee-decision taxonomy's event-type keys (fetched from `GET /matches/event-types`, not hardcoded here). */
  eventType: string;
  subEvent: string | null;
  outcome: string | null;
  description: Localized;
  initialCall: "given" | "not-given";
  varReview: boolean;
  finalCall: "confirmed" | "overturned";
  confidence: number;
  pressureIndex: number;
  /** Referee's distance from the incident, in metres. */
  distance: number;
  players: string[];
}

export interface HeatPoint {
  x: number;
  y: number;
  intensity: number;
}

/** One leaf of the referee-decision taxonomy, exactly as `GET /matches/event-types` serves it. */
export interface EventOutcome {
  key: string;
  labelFr: string;
  labelEn: string;
}

export interface EventSubEvent {
  key: string;
  labelFr: string;
  labelEn: string;
  outcomes?: EventOutcome[];
  variable?: boolean;
}

export interface EventType {
  key: string;
  labelFr: string;
  labelEn: string;
  subEvents: EventSubEvent[];
}

export interface MatchRecord {
  id: string;
  /** The calendar fixture this match was played from, when it came through the designation pipeline. */
  fixtureId?: string | null;
  home: string;
  away: string;
  competitionId: string;
  countryCode: string;
  date: string;
  /** Display string, e.g. "2–1". */
  score: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  season: string;
  refereeId: string;
  arpsForMatch: number;
  rmcs: number;
  pressureAvg: number;
  physical: {
    distanceKm: number;
    sprints: number;
    topSpeed: number;
    avgDistanceToBall: number;
    diagonalAdherence: number;
  };
  decisions: MatchDecision[];
  pressureTimeline: { minute: number; pressure: number }[];
  /** Presence samples in metres on a 105 x 68 pitch, as recorded for the match (empty when none were). */
  heatPoints: HeatPoint[];
  /** The weather as recorded for the match; null when nobody entered it. */
  weather?: { condition: string; temperatureC?: number | null; humidity?: number | null } | null;
}

export interface Assessment {
  id: string;
  matchId: string;
  refereeId: string;
  observerId: string;
  state: "filed" | "draft" | "overdue";
  filedHoursAfter: number | null;
  /** Released to the referee; until then the report is the federation's only. */
  published?: boolean;
  overall: number;
  /** One mark (0–10) per criterion of the platform grid — the grid's keys, which an administrator may change. */
  marks: Record<string, number>;
  notes: Localized;
  clips: { minute: number; label: Localized }[];
}

export interface Licence {
  id: string;
  refereeId: string;
  kind: "FIFA Badge" | "CAF Elite Panel" | "National D1" | "VAR Certification" | "Fitness Clearance";
  issued: string;
  expires: string;
}

export interface FitnessTest {
  refereeId: string;
  date: string;
  test1: { result: "passed" | "failed"; bestSprint: number };
  test2: { result: "passed" | "failed"; laps: number };
  retestDate: string | null;
}

export interface Course {
  id: string;
  name: Localized;
  provider: string;
  hours: number;
  refereeIds: string[];
  state: "enrolled" | "completed" | "not-started";
}

export interface Dossier {
  id: string;
  matchId: string;
  generated: string;
  pages: number;
  recipients: string[];
  /** Section ids chosen when it was built, in print order. */
  sections?: string[];
}

/** One referee's mean mark (0–10) per grid criterion over their filed reports, from `snapshot.analytics`. */
export interface CriterionAverage {
  refereeId: string;
  /** Filed reports on the referee. */
  reports: number;
  marks: Record<string, { avg: number; n: number }>;
}

export interface Criterion {
  key: string;
  label: Localized;
  weight: number;
}

export interface Notification {
  id: string;
  title: Localized;
  detail: Localized;
  /** ISO timestamp; the relative wording is produced at render time, in the active language. */
  createdAt: string;
  tone: "pitch" | "amber" | "red" | "var";
  read: boolean;
  href: string;
}

export interface TrendPoint {
  /** "YYYY-MM" */
  month: string;
  score: number;
}

export type DecisionOutcome = "correct" | "correct-var" | "overturned";

export interface DecisionShare {
  id: DecisionOutcome;
  /** Percentage of reviewed decisions. */
  value: number;
}

export interface ApiSnapshot {
  today: string;
  window: { from: string; to: string };
  countries: Country[];
  competitions: Competition[];
  referees: Referee[];
  assistants: Assistant[];
  fixtures: ApiFixture[];
  matches: Array<
    Omit<MatchRecord, "physical" | "pressureTimeline" | "heatPoints"> &
      Partial<Pick<MatchRecord, "physical" | "pressureTimeline" | "heatPoints">>
  >;
  assessments: Assessment[];
  licences: Licence[];
  fitnessTests: FitnessTest[];
  courses: Course[];
  dossiers: Dossier[];
  availability: Array<{ officialId: string; date: string; state: AvailabilityState }>;
  criteria: Criterion[];
  analytics: {
    arpsTrend: TrendPoint[];
    decisionsBreakdown: DecisionShare[];
    criterionAverages?: CriterionAverage[];
  };
}
