"use client";

import { useMemo, useState } from "react";
import { Check, Download, FileText, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFormatters, useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { useScope } from "@/lib/scope/ScopeProvider";
import { PageHeading } from "@/components/layout/PageHeading";
import { Badge, Board, Button, Card, CardHeader, EmptyState, Select } from "@/components/ui";
import { CrewStrip } from "@/components/officiating/CrewStrip";
import {
  assessmentByMatch,
  competitionById,
  countryFlag,
  dossiers,
  fixtures,
  matchById,
  matches,
  refereeById,
} from "@/lib/mock-data";

const sectionKeys = [
  ["summary", "reports.secSummary"],
  ["decisions", "reports.secDecisions"],
  ["positioning", "reports.secPositioning"],
  ["observer", "reports.secObserver"],
  ["crew", "reports.secCrew"],
  ["comparison", "reports.secComparison"],
] as const;

const recipientKeys = [
  ["federation", "reports.recipientFederation"],
  ["referee", "reports.recipientReferee"],
  ["caf", "reports.recipientCaf"],
] as const;

export default function ReportsPage() {
  const t = useT();
  const { locale } = useLocale();
  const fmt = useFormatters();
  const { matches: inScope } = useScope();

  const list = useMemo(() => matches.filter((m) => inScope(m.countryCode)), [inScope]);
  const [matchId, setMatchId] = useState(list[0]?.id ?? matches[0].id);
  const match = list.find((m) => m.id === matchId) ?? list[0];

  const [sections, setSections] = useState<string[]>(["summary", "decisions", "observer", "crew"]);
  const [recipients, setRecipients] = useState<string[]>(["federation"]);
  const [state, setState] = useState<"idle" | "building" | "ready">("idle");

  if (!match) {
    return (
      <div className="space-y-4">
        <PageHeading titleKey="reports.title" subtitleKey="subtitles.reports" />
        <Card>
          <EmptyState title={t("calendar.noFixtures")} hint={t("calendar.noFixturesHint")} />
        </Card>
      </div>
    );
  }

  const referee = refereeById.get(match.refereeId);
  const report = assessmentByMatch.get(match.id);
  const fixture = fixtures.find((f) => f.home === match.home && f.away === match.away);
  const pages = 4 + sections.length * 2;

  function toggle(list: string[], setter: (next: string[]) => void, value: string) {
    setter(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
    setState("idle");
  }

  function build() {
    setState("building");
    window.setTimeout(() => setState("ready"), 900);
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeading titleKey="reports.title" subtitleKey="subtitles.reports" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="space-y-4">
          <Card>
            <CardHeader title={t("reports.builder")} subtitle={t("reports.builderSub")} />
            <Select
              label={t("common.match")}
              value={match.id}
              onChange={(id) => {
                setMatchId(id);
                setState("idle");
              }}
              options={list.map((m) => ({
                value: m.id,
                label: `${m.home} — ${m.away} · ${m.date}`,
              }))}
            />

            <p className="mb-2 mt-4 text-[11px] uppercase tracking-[0.1em] text-chalk-faint">
              {t("reports.sections")}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {sectionKeys.map(([id, labelKey]) => {
                const on = sections.includes(id);
                return (
                  <button
                    key={id}
                    onClick={() => toggle(sections, setSections, id)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-[12.5px] transition-colors",
                      on ? "border-line-strong bg-white/[0.05] text-chalk" : "border-line bg-ink-1 text-chalk-faint hover:text-chalk-dim",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border",
                        on ? "border-pitch bg-pitch text-[#04140c]" : "border-line",
                      )}
                    >
                      {on && <Check size={11} />}
                    </span>
                    {t(labelKey)}
                  </button>
                );
              })}
            </div>

            <p className="mb-2 mt-4 text-[11px] uppercase tracking-[0.1em] text-chalk-faint">
              {t("reports.recipients")}
            </p>
            <div className="flex flex-wrap gap-2">
              {recipientKeys.map(([id, labelKey]) => {
                const on = recipients.includes(id);
                return (
                  <button
                    key={id}
                    onClick={() => toggle(recipients, setRecipients, id)}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-[12.5px] transition-colors",
                      on ? "border-pitch bg-pitch text-[#04140c]" : "border-line bg-ink-1 text-chalk-dim hover:text-chalk",
                    )}
                  >
                    {t(labelKey)}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button variant="primary" onClick={build} disabled={sections.length === 0 || state === "building"}>
                <Send size={13} />
                {state === "building" ? t("reports.generating") : t("reports.generatePdf")}
              </Button>
              <span className="text-[12px] text-chalk-faint">
                {pages} {t("reports.pages")}
              </span>
              {state === "ready" && (
                <Badge tone="pitch">
                  <Check size={11} />
                  {t("reports.ready")}
                </Badge>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title={t("reports.recent")} subtitle={t("reports.recentSub")} />
            <ul className="space-y-2">
              {dossiers.map((dossier) => {
                const dossierMatch = matchById.get(dossier.matchId);
                if (!dossierMatch) return null;
                return (
                  <li
                    key={dossier.id}
                    className="flex items-center gap-3 rounded-lg border border-line bg-ink-1 px-3 py-2.5"
                  >
                    <FileText size={15} className="shrink-0 text-chalk-faint" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] text-chalk">
                        {countryFlag(dossierMatch.countryCode)} {dossierMatch.home} — {dossierMatch.away}
                      </p>
                      <p className="truncate text-[11px] text-chalk-faint">
                        {t("reports.generated")} {fmt.date(dossier.generated)} · {dossier.pages} {t("reports.pages")} ·{" "}
                        {dossier.recipients.join(", ")}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost">
                      <Download size={13} />
                    </Button>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title={t("reports.preview")} />
          <div className="rounded-lg border border-line bg-ink-1 p-4">
            <p className="text-[10px] uppercase tracking-[0.12em] text-chalk-faint">
              {locale === "fr" ? "Dossier match et arbitrage" : "Match & refereeing dossier"}
            </p>
            <h3 className="mt-1 font-display text-[16px] font-semibold text-chalk">
              {match.home} <span className="board text-chalk-dim">{match.score}</span> {match.away}
            </h3>
            <p className="mt-0.5 text-[11.5px] text-chalk-faint">
              {competitionById.get(match.competitionId)?.name} · {fmt.longDate(match.date)}
            </p>

            <div className="my-3 chalk-rule" />

            <div className="grid grid-cols-3 gap-2">
              <Board label={t("matchReview.matchArps")} value={match.arpsForMatch} />
              <Board label={t("arae.rmcs")} value={match.rmcs} />
              <Board
                label={t("assessments.overall")}
                value={report && report.state === "filed" ? report.overall.toFixed(1) : "—"}
              />
            </div>

            <ul className="mt-3 space-y-1.5">
              {sectionKeys
                .filter(([id]) => sections.includes(id))
                .map(([id, labelKey], i) => (
                  <li key={id} className="flex items-center gap-2 text-[12px] text-chalk-dim">
                    <span className="board w-5 text-chalk-faint">{String(i + 1).padStart(2, "0")}</span>
                    {t(labelKey)}
                  </li>
                ))}
            </ul>

            {sections.includes("crew") && fixture && (
              <>
                <p className="mb-1.5 mt-3 text-[10px] uppercase tracking-[0.1em] text-chalk-faint">
                  {t("common.crew")}
                </p>
                <CrewStrip crew={fixture.crew} />
              </>
            )}

            {referee && (
              <p className="mt-3 text-[11.5px] text-chalk-faint">
                {t("common.referee")}: {referee.name} · {countryFlag(referee.countryCode)}
              </p>
            )}
          </div>

          <p className="mt-3 text-[11.5px] leading-relaxed text-chalk-faint">
            {locale === "fr"
              ? "Le dossier combine l'analyse tactique AfriScout et la qualité d'arbitrage ARIS dans un seul document — c'est ce que ni un outil de désignation ni un fournisseur VAR ne produit aujourd'hui."
              : "The dossier puts AfriScout's tactical analysis and ARIS refereeing quality in one document — something neither an assignment tool nor a VAR vendor produces today."}
          </p>
        </Card>
      </div>
    </div>
  );
}
