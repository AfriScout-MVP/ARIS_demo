"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, ListChecks, Plus, Radio, Trash2, Video } from "@/components/icons/glyphs";
import { cn } from "@/lib/utils";
import { useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { PageHeading } from "@/components/layout/PageHeading";
import { Badge, Button, Card, CardHeader, EmptyState, type Tone } from "@/components/ui";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { DecisionDialog } from "./DecisionDialog";
import { getMatch, listEventTypes, listMatches, removeDecision } from "@/lib/api/assessments";
import { useResource } from "@/lib/admin/hooks";
import { useToast } from "@/lib/toast/ToastProvider";
import { eventTypeLabel, outcomeLabel, subEventLabel } from "@/lib/matches/eventTypes";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { pickLocalized } from "@/lib/i18n/localized";
import type { MatchDecision } from "@/lib/store/types";

/** The taxonomy's 7 event types are fixed code, not admin-editable data, so their tone can be a plain lookup. */
const EVENT_TONE: Record<string, Tone> = {
  penalty_decision: "red",
  card: "amber",
  offside_call: "var",
  foul_advantage: "neutral",
  var_review: "var",
  misconduct_dissent: "amber",
  goal_validation: "gold",
};
const toneFor = (eventType: string): Tone => EVENT_TONE[eventType] ?? "neutral";

/**
 * A tagger's one screen: pick a match of its own country, tag the referee's decisions on it. No season
 * analytics, no crew strip, no snapshot: a tagger never loads the staff dataset (see DataGate).
 */
export function TaggerMatchReview() {
  const t = useT();
  const { locale } = useLocale();
  const toast = useToast();
  const { data: eventTypes } = useResource("event-types", (signal) => listEventTypes(signal));
  const { data: list } = useResource("tagger:matches", (signal) => listMatches({ limit: 100 }, signal));
  const [matchId, setMatchId] = useState<string | null>(null);
  const activeId = matchId ?? list?.[0]?.id ?? null;
  const {
    data: match,
    loading: matchLoading,
    reload: reloadMatch,
  } = useResource(`tagger:match:${activeId}`, (signal) => getMatch(activeId!, signal), !!activeId);
  const [decisionId, setDecisionId] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  const [removing, setRemoving] = useState<MatchDecision | null>(null);

  if (list && list.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeading titleKey="matchReview.title" subtitleKey="subtitles.matchReview" />
        <Card>
          <EmptyState title={t("calendar.noFixtures")} hint={t("calendar.noFixturesHint")} />
        </Card>
      </div>
    );
  }

  const active = match?.decisions.find((d) => d.id === decisionId) ?? match?.decisions[0];
  const matchTitle = match ? `${match.home} ${match.score} ${match.away}` : "";

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeading titleKey="matchReview.title" subtitleKey="subtitles.matchReview" />

      <Card>
        <CardHeader icon={Video} tint="var" title={t("matchReview.selectMatch")} subtitle={t("matchReview.selectMatchSub")} />
        <div className="scroll-x -mx-1 px-1">
          <div className="flex gap-2">
            {(list ?? []).map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setMatchId(m.id);
                  setDecisionId(null);
                }}
                className={cn(
                  "shrink-0 rounded-lg border px-3 py-1.5 text-xs transition-colors max-sm:min-h-10",
                  // ds-allow-hardcode:start - same selected-match highlight as the staff match strip (decision-engine/page.tsx)
                  m.id === activeId ? "border-red-600 bg-red-600 text-white" : "border-line bg-ink-1 text-chalk-dim hover:border-line-strong hover:text-chalk",
                  // ds-allow-hardcode:end
                )}
              >
                <CountryFlag code={m.countryCode} /> {m.home} · {m.away}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {matchLoading || !match ? (
        <Card>
          <EmptyState title={t("admin.common.loading")} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2" padded={false}>
            <div className="px-4 py-3">
              <CardHeader
                icon={ListChecks}
                tint="pitch"
                title={t("matchReview.timeline")}
                subtitle={t("matchReview.timelineSub", { n: match.decisions.length })}
                className="mb-0"
                action={
                  <Button size="sm" variant="secondary" onClick={() => setLogging(true)}>
                    <Plus size={13} />
                    {t("matchReview.log.open")}
                  </Button>
                }
              />
            </div>
            <div className="chalk-rule" />
            {match.decisions.length === 0 && (
              <div className="px-4 py-3">
                <EmptyState title={t("matchReview.noDecisions")} hint={t("matchReview.log.emptyStaff")} />
              </div>
            )}
            <ul>
              {match.decisions.map((decision) => (
                <li key={decision.id}>
                  <button
                    onClick={() => setDecisionId(decision.id)}
                    className={cn(
                      "flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left last:border-0 transition-colors",
                      active?.id === decision.id ? "bg-wash/6" : "hover:bg-wash/3",
                    )}
                  >
                    <span className="board w-9 shrink-0 text-sm text-chalk-faint">{decision.minute}&apos;</span>
                    <Badge tone={toneFor(decision.eventType)} className="shrink-0">
                      {eventTypeLabel(eventTypes, decision.eventType, locale)}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-xs text-chalk-dim">{pickLocalized(decision.description, locale)}</span>
                    {decision.varReview && <Radio size={13} className="shrink-0 text-var" />}
                    {decision.finalCall === "overturned" ? (
                      <AlertTriangle size={14} className="shrink-0 text-amber" />
                    ) : (
                      <CheckCircle2 size={14} className="shrink-0 text-pitch" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          {!active ? (
            <Card>
              <CardHeader icon={ListChecks} tint="gold" title={t("matchReview.detail")} />
              <EmptyState title={t("common.empty")} />
            </Card>
          ) : (
            <Card>
              <CardHeader
                icon={ListChecks}
                tint="gold"
                title={t("matchReview.detail")}
                subtitle={`${t("matchReview.minute")} ${active.minute}'`}
                action={
                  <Button size="sm" variant="ghost" onClick={() => setRemoving(active)} aria-label={t("matchReview.log.remove")}>
                    <Trash2 size={13} />
                  </Button>
                }
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={toneFor(active.eventType)}>{eventTypeLabel(eventTypes, active.eventType, locale)}</Badge>
                {active.subEvent && <Badge tone="neutral">{subEventLabel(eventTypes, active.eventType, active.subEvent, locale)}</Badge>}
                {active.subEvent && active.outcome && (
                  <Badge tone="neutral">{outcomeLabel(eventTypes, active.eventType, active.subEvent, active.outcome, locale)}</Badge>
                )}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-chalk">{pickLocalized(active.description, locale)}</p>

              <dl className="mt-4 grid grid-cols-2 gap-2">
                <Fact label={t("matchReview.initialCall")} value={t(active.initialCall === "given" ? "matchReview.given" : "matchReview.notGiven")} />
                <Fact
                  label={t("matchReview.finalCall")}
                  value={t(active.finalCall === "confirmed" ? "matchReview.confirmedCall" : "matchReview.overturnedCall")}
                  tone={active.finalCall === "confirmed" ? "text-pitch" : "text-amber"}
                />
                <Fact
                  label={t("matchReview.varReview")}
                  value={t(active.varReview ? "common.yes" : "common.no")}
                  tone={active.varReview ? "text-var" : "text-chalk"}
                />
                <Fact label={t("matchReview.confidence")} value={`${active.confidence}%`} />
              </dl>

              {active.players.length > 0 && (
                <div className="mt-4">
                  <p className="mb-1.5 text-xs font-medium text-chalk-faint">{t("matchReview.playersInvolved")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {active.players.map((player) => (
                      <Badge key={player} tone="neutral">
                        {player}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {logging && match && (
        <DecisionDialog
          matchId={match.id}
          title={matchTitle}
          onClose={() => setLogging(false)}
          onDone={() => {
            setLogging(false);
            reloadMatch();
          }}
        />
      )}
      {removing && match && (
        <ConfirmDialog
          title={t("matchReview.log.removeTitle")}
          confirmLabel={t("matchReview.log.remove")}
          danger
          perform={() => removeDecision(match.id, removing.id)}
          onCancel={() => setRemoving(null)}
          onDone={() => {
            setRemoving(null);
            setDecisionId(null);
            toast.push("success", t("matchReview.log.removed"));
            reloadMatch();
          }}
        >
          {t("matchReview.log.removeBody", { minute: removing.minute, type: eventTypeLabel(eventTypes, removing.eventType, locale) })}
        </ConfirmDialog>
      )}
    </div>
  );
}

function Fact({ label, value, tone = "text-chalk" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-ink-1 px-2.5 py-2">
      <dt className="text-xs font-medium text-chalk-faint">{label}</dt>
      <dd className={cn("mt-0.5 text-xs font-medium", tone)}>{value}</dd>
    </div>
  );
}
