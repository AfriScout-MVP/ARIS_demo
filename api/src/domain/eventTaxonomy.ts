// The referee-decision taxonomy: event type -> sub-event -> outcomes. One source of truth,
// served to the frontend by GET /matches/event-types and used server-side to validate a tag
// at write time (decisionSchema in routes/assessments.ts).
//
// This is NOT admin-editable at runtime and NOT mirrored in a second frontend copy — only the
// top-level `eventType` is additionally enforced by a DB CHECK constraint
// (migrations/0017_tagging.sql); subEvent/outcome are validated here, in application code,
// against this same object, so the taxonomy can grow without a migration.

export interface EventOutcome {
  /** Stable key stored in match_decisions.outcome. */
  key: string;
  labelFr: string;
  labelEn: string;
}

export interface EventSubEvent {
  key: string;
  labelFr: string;
  labelEn: string;
  /** Outcomes this sub-event may resolve to; omitted when the sub-event itself is the final step. */
  outcomes?: EventOutcome[];
  /** Whether a VAR review is a normal part of this sub-event (informative only — var_review stays a free boolean). */
  variable?: boolean;
}

export interface EventType {
  key: string;
  labelFr: string;
  labelEn: string;
  subEvents: EventSubEvent[];
}

export const REFEREE_EVENT_TAXONOMY: readonly EventType[] = [
  {
    key: "penalty_decision",
    labelFr: "Penalty",
    labelEn: "Penalty Decision",
    subEvents: [
      {
        key: "direct_foul",
        labelFr: "Faute directe",
        labelEn: "Direct Foul",
        variable: true,
        outcomes: [
          { key: "given", labelFr: "Accordé", labelEn: "Given" },
          { key: "not_given", labelFr: "Refusé", labelEn: "Not Given" },
          { key: "given_overturned", labelFr: "Accordé — annulé par la VAR", labelEn: "Given — Overturned by VAR" },
          { key: "not_given_overturned", labelFr: "Refusé — accordé après VAR", labelEn: "Not Given — Overturned by VAR" },
        ],
      },
      {
        key: "handball",
        labelFr: "Main",
        labelEn: "Handball",
        variable: true,
        outcomes: [
          { key: "given", labelFr: "Accordé", labelEn: "Given" },
          { key: "not_given", labelFr: "Refusé", labelEn: "Not Given" },
        ],
      },
      {
        key: "dogso",
        labelFr: "Occasion manifeste de but (DOGSO)",
        labelEn: "Denial of an Obvious Goal-Scoring Opportunity",
        variable: true,
        outcomes: [
          { key: "given", labelFr: "Accordé", labelEn: "Given" },
          { key: "not_given", labelFr: "Refusé", labelEn: "Not Given" },
        ],
      },
    ],
  },
  {
    key: "card",
    labelFr: "Carton",
    labelEn: "Card",
    subEvents: [
      {
        key: "yellow",
        labelFr: "Carton jaune",
        labelEn: "Yellow Card",
        outcomes: [
          { key: "issued", labelFr: "Donné", labelEn: "Issued" },
          { key: "rescinded", labelFr: "Annulé sur appel", labelEn: "Rescinded on Review" },
        ],
      },
      {
        key: "second_yellow",
        labelFr: "Deuxième jaune",
        labelEn: "Second Yellow",
        outcomes: [{ key: "issued", labelFr: "Donné", labelEn: "Issued" }],
      },
      {
        key: "red",
        labelFr: "Carton rouge direct",
        labelEn: "Straight Red",
        variable: true,
        outcomes: [
          { key: "issued", labelFr: "Donné", labelEn: "Issued" },
          { key: "rescinded", labelFr: "Annulé sur appel", labelEn: "Rescinded on Review" },
        ],
      },
    ],
  },
  {
    key: "offside_call",
    labelFr: "Hors-jeu",
    labelEn: "Offside Call",
    subEvents: [
      {
        key: "attacking_phase",
        labelFr: "Phase offensive",
        labelEn: "Attacking Phase",
        variable: true,
        outcomes: [
          { key: "flagged", labelFr: "Signalé", labelEn: "Flagged" },
          { key: "play_on", labelFr: "Jeu continué", labelEn: "Play-On" },
          { key: "overturned", labelFr: "Annulé par la VAR", labelEn: "Overturned by VAR" },
        ],
      },
      {
        key: "build_up",
        labelFr: "Phase de construction",
        labelEn: "Build-Up Phase",
        outcomes: [
          { key: "flagged", labelFr: "Signalé", labelEn: "Flagged" },
          { key: "play_on", labelFr: "Jeu continué", labelEn: "Play-On" },
        ],
      },
    ],
  },
  {
    key: "foul_advantage",
    labelFr: "Faute / avantage",
    labelEn: "Foul / Advantage",
    subEvents: [
      { key: "foul_given", labelFr: "Faute sifflée", labelEn: "Foul Given", outcomes: [{ key: "confirmed", labelFr: "Confirmée", labelEn: "Confirmed" }] },
      {
        key: "advantage_played",
        labelFr: "Avantage joué",
        labelEn: "Advantage Played",
        outcomes: [
          { key: "confirmed", labelFr: "Confirmé", labelEn: "Confirmed" },
          { key: "withdrawn", labelFr: "Retiré", labelEn: "Withdrawn" },
        ],
      },
      { key: "tactical_foul", labelFr: "Faute tactique", labelEn: "Tactical Foul", outcomes: [{ key: "confirmed", labelFr: "Confirmée", labelEn: "Confirmed" }] },
    ],
  },
  {
    key: "var_review",
    labelFr: "Revue VAR",
    labelEn: "VAR Review",
    subEvents: [
      {
        key: "pitch_side_monitor",
        labelFr: "Écran de bord de terrain",
        labelEn: "Pitch-Side Monitor Review",
        variable: true,
        outcomes: [
          { key: "confirmed", labelFr: "Confirmée", labelEn: "Call Confirmed" },
          { key: "overturned", labelFr: "Annulée", labelEn: "Call Overturned" },
        ],
      },
      {
        key: "silent_check",
        labelFr: "Vérification silencieuse",
        labelEn: "Silent Check",
        variable: true,
        outcomes: [{ key: "no_intervention", labelFr: "Aucune intervention", labelEn: "No Intervention Needed" }],
      },
    ],
  },
  {
    key: "misconduct_dissent",
    labelFr: "Contestation / comportement antisportif",
    labelEn: "Misconduct / Dissent",
    subEvents: [
      {
        key: "dissent",
        labelFr: "Contestation",
        labelEn: "Dissent",
        outcomes: [
          { key: "caution", labelFr: "Avertissement", labelEn: "Caution" },
          { key: "warning_only", labelFr: "Avertissement verbal", labelEn: "Warning Only" },
        ],
      },
      { key: "unsporting_behaviour", labelFr: "Comportement antisportif", labelEn: "Unsporting Behaviour", outcomes: [{ key: "caution", labelFr: "Avertissement", labelEn: "Caution" }] },
      { key: "violent_conduct", labelFr: "Comportement violent", labelEn: "Violent Conduct", outcomes: [{ key: "send_off", labelFr: "Exclusion", labelEn: "Send-Off" }] },
    ],
  },
  {
    key: "goal_validation",
    labelFr: "Validation de but",
    labelEn: "Goal Validation",
    subEvents: [
      {
        key: "goal_line_technology",
        labelFr: "Technologie de la ligne de but",
        labelEn: "Goal-Line Technology Check",
        outcomes: [
          { key: "stands", labelFr: "But validé", labelEn: "Goal Stands" },
          { key: "disallowed", labelFr: "But refusé", labelEn: "Goal Disallowed" },
        ],
      },
      {
        key: "offside_before_goal",
        labelFr: "Hors-jeu avant le but",
        labelEn: "Offside Check Before Goal",
        variable: true,
        outcomes: [
          { key: "stands", labelFr: "But validé", labelEn: "Goal Stands" },
          { key: "disallowed", labelFr: "But refusé", labelEn: "Goal Disallowed" },
        ],
      },
      {
        key: "foul_before_goal",
        labelFr: "Faute avant le but",
        labelEn: "Foul Check Before Goal",
        variable: true,
        outcomes: [
          { key: "stands", labelFr: "But validé", labelEn: "Goal Stands" },
          { key: "disallowed", labelFr: "But refusé", labelEn: "Goal Disallowed" },
        ],
      },
    ],
  },
] as const;

export const EVENT_TYPE_KEYS = REFEREE_EVENT_TAXONOMY.map((e) => e.key) as [string, ...string[]];
export const eventTypeByKey = new Map(REFEREE_EVENT_TAXONOMY.map((e) => [e.key, e]));

export interface EventFlow {
  valid: boolean;
  needsSubEvent: boolean;
  needsOutcome: boolean;
  suggestsVar: boolean;
  subEvents: readonly EventSubEvent[];
  outcomes: readonly EventOutcome[];
}

/** Declarative resolution of "what comes next" for one step of the tagging flow. Pure; shared by the API and (as a thin mirror) the site. */
export function resolveEventFlow(eventType: string, subEvent?: string | null, outcome?: string | null): EventFlow {
  const type = eventTypeByKey.get(eventType);
  if (!type) return { valid: false, needsSubEvent: false, needsOutcome: false, suggestsVar: false, subEvents: [], outcomes: [] };
  const sub = subEvent ? type.subEvents.find((s) => s.key === subEvent) : undefined;
  const needsSubEvent = type.subEvents.length > 0;
  const needsOutcome = !!sub?.outcomes?.length;
  const subValid = !needsSubEvent || !!sub;
  const outcomeValid = !needsOutcome || !outcome || sub!.outcomes!.some((o) => o.key === outcome);
  return {
    valid: subValid && outcomeValid,
    needsSubEvent,
    needsOutcome,
    suggestsVar: sub?.variable ?? false,
    subEvents: type.subEvents,
    outcomes: sub?.outcomes ?? [],
  };
}
