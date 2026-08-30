"use client";

import { useMemo, useState } from "react";
import {
  Check,
  ClipboardList,
  Download,
  FileText,
  Files,
  GitCompareArrows,
  Globe2,
  Landmark,
  Link2,
  ListChecks,
  Map,
  Send,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFormatters, useLocale, useT } from "@/lib/i18n/LocaleProvider";
import type { TKey } from "@/lib/i18n/LocaleProvider";
import { useScope } from "@/lib/scope/ScopeProvider";
import { PageHeading } from "@/components/layout/PageHeading";
import { Badge, Board, Button, Card, CardHeader, EmptyState, Segmented, Select, Th, Td } from "@/components/ui";
import { CrewStrip } from "@/components/officiating/CrewStrip";
import { Mark } from "@/components/icons/Mark";
import {
  SEASON,
  assessmentByMatch,
  competitionById,
  countryFlag,
  dossiers,
  fixtures,
  matchById,
  matches,
  refereeById,
} from "@/lib/mock-data";

/** Cover and contents are always printed, whatever else is selected. */
const FRONT_MATTER_PAGES = 2;

interface SectionSpec {
  id: string;
  labelKey: TKey;
  hintKey: TKey;
  pages: number;
  icon: LucideIcon;
}

const SECTIONS: SectionSpec[] = [
  { id: "summary", labelKey: "reports.secSummary", hintKey: "reports.secSummaryHint", pages: 2, icon: FileText },
  { id: "decisions", labelKey: "reports.secDecisions", hintKey: "reports.secDecisionsHint", pages: 4, icon: ListChecks },
  { id: "positioning", labelKey: "reports.secPositioning", hintKey: "reports.secPositioningHint", pages: 3, icon: Map },
  { id: "observer", labelKey: "reports.secObserver", hintKey: "reports.secObserverHint", pages: 3, icon: ClipboardList },
  { id: "crew", labelKey: "reports.secCrew", hintKey: "reports.secCrewHint", pages: 2, icon: Users },
  { id: "comparison", labelKey: "reports.secComparison", hintKey: "reports.secComparisonHint", pages: 2, icon: GitCompareArrows },
];

const RECIPIENTS: { id: string; labelKey: TKey; icon: LucideIcon }[] = [
  { id: "federation", labelKey: "reports.recipientFederation", icon: Landmark },
  { id: "referee", labelKey: "reports.recipientReferee", icon: User },
  { id: "caf", labelKey: "reports.recipientCaf", icon: Globe2 },
];

/** A filing reference an archivist could actually look up. */
function reference(matchId: string, countryCode: string) {
  const seq = matchId.replace(/\D/g, "").slice(-4).padStart(4, "0");
  return `ARIS/${SEASON.replace("/", "-")}/${countryCode}/${seq}`;
}

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
  const [format, setFormat] = useState<"pdf" | "link">("pdf");
  const [state, setState] = useState<"idle" | "building" | "ready">("idle");

  const scopedDossiers = useMemo(
    () => dossiers.filter((d) => inScope(matchById.get(d.matchId)?.countryCode ?? "")),
    [inScope],
  );

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
  const competition = competitionById.get(match.competitionId);

  const chosen = SECTIONS.filter((section) => sections.includes(section.id));
  const totalPages = FRONT_MATTER_PAGES + chosen.reduce((sum, section) => sum + section.pages, 0);

  // Running start page, so the contents page numbers add up.
  const contents = chosen.map((section, i) => ({
    section,
    startsAt:
      FRONT_MATTER_PAGES + 1 + chosen.slice(0, i).reduce((sum, prev) => sum + prev.pages, 0),
  }));

  const pagesProduced = scopedDossiers.reduce((sum, d) => sum + d.pages, 0);
  const uniqueRecipients = new Set(scopedDossiers.flatMap((d) => d.recipients)).size;
  const awaiting = list.filter((m) => assessmentByMatch.get(m.id)?.state !== "filed").length;

  function toggle(current: string[], setter: (next: string[]) => void, value: string) {
    setter(current.includes(value) ? current.filter((v) => v !== value) : [...current, value]);
    setState("idle");
  }

  function build() {
    setState("building");
    window.setTimeout(() => setState("ready"), 900);
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeading titleKey="reports.title" subtitleKey="subtitles.reports" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Board
          primary
          tone="var"
          icon={FileText}
          label={t("reports.kpiThisMonth")}
          value={scopedDossiers.length}
          hint={t("reports.recentSub")}
        />
        <Board tone="gold" icon={Files} label={t("reports.kpiPages")} value={pagesProduced} />
        <Board tone="pitch" icon={Send} label={t("reports.kpiRecipients")} value={uniqueRecipients} />
        <Board
          icon={ClipboardList}
          label={t("reports.kpiAwaiting")}
          value={awaiting}
          tone={awaiting ? "amber" : "pitch"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
        {/* ---------------------------------------------------------- *
         * Compose
         * ---------------------------------------------------------- */}
        <Card tint="pitch">
          <CardHeader
            icon={FileText}
            tint="pitch"
            title={t("reports.builder")}
            subtitle={t("reports.builderSub")}
          />

          <Select
            label={t("reports.sourceMatch")}
            value={match.id}
            onChange={(id) => {
              setMatchId(id);
              setState("idle");
            }}
            options={list.map((m) => ({
              value: m.id,
              label: `${m.home} — ${m.away} · ${m.score} · ${m.date}`,
            }))}
          />

          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-ink-1 px-3 py-2 text-[12px] text-chalk-faint">
            <span>{countryFlag(match.countryCode)}</span>
            <span className="text-chalk-dim">{competition?.name}</span>
            <span>·</span>
            <span>{fmt.longDate(match.date)}</span>
            {referee && (
              <>
                <span>·</span>
                <span>
                  {t("common.referee")}: <span className="text-chalk-dim">{referee.name}</span>
                </span>
              </>
            )}
          </div>

          <p className="mb-2 mt-5 text-[11px] uppercase tracking-[0.1em] text-chalk-faint">
            {t("reports.sections")}
          </p>
          <div className="space-y-2">
            {SECTIONS.map((section) => {
              const on = sections.includes(section.id);
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => toggle(sections, setSections, section.id)}
                  aria-pressed={on}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                    on
                      ? "border-pitch/35 bg-pitch/[0.07]"
                      : "border-line bg-ink-1 hover:border-line-strong",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                      on ? "bg-pitch/15 text-pitch" : "bg-white/[0.05] text-chalk-faint",
                    )}
                  >
                    <Icon size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-[13px]", on ? "text-chalk" : "text-chalk-dim")}>
                      {t(section.labelKey)}
                    </span>
                    <span className="block text-[11.5px] leading-snug text-chalk-faint">
                      {t(section.hintKey)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="board text-[11px] text-chalk-faint">
                      {section.pages} {t("reports.pages")}
                    </span>
                    <span
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded-[4px] border",
                        on ? "border-pitch bg-pitch text-[#04140c]" : "border-line",
                      )}
                    >
                      {on && <Check size={11} />}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-[0.1em] text-chalk-faint">
                {t("reports.recipients")}
              </p>
              <div className="flex flex-wrap gap-2">
                {RECIPIENTS.map((entry) => {
                  const on = recipients.includes(entry.id);
                  const Icon = entry.icon;
                  return (
                    <button
                      key={entry.id}
                      onClick={() => toggle(recipients, setRecipients, entry.id)}
                      aria-pressed={on}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] transition-colors",
                        on
                          ? "border-pitch bg-pitch text-[#04140c]"
                          : "border-line bg-ink-1 text-chalk-dim hover:border-line-strong hover:text-chalk",
                      )}
                    >
                      <Icon size={12} />
                      {t(entry.labelKey)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[11px] uppercase tracking-[0.1em] text-chalk-faint">
                {t("reports.delivery")}
              </p>
              <Segmented
                value={format}
                onChange={setFormat}
                options={[
                  { value: "pdf", label: t("reports.formatPdf") },
                  { value: "link", label: t("reports.formatLink") },
                ]}
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Button variant="primary" onClick={build} disabled={sections.length === 0 || state === "building"}>
              {format === "pdf" ? <Send size={13} /> : <Link2 size={13} />}
              {state === "building" ? t("reports.generating") : t("reports.generatePdf")}
            </Button>
            <span className="board text-[12px] text-chalk-faint">
              {totalPages} {t("reports.pages")}
            </span>
            {sections.length === 0 && (
              <span className="text-[12px] text-amber">{t("reports.noSections")}</span>
            )}
            {state === "ready" && (
              <Badge tone="pitch">
                <Check size={11} />
                {t("reports.ready")}
              </Badge>
            )}
          </div>
        </Card>

        {/* ---------------------------------------------------------- *
         * The page that comes out — laid out as the document itself
         * ---------------------------------------------------------- */}
        <div className="space-y-2 lg:sticky lg:top-4 lg:self-start">
          <p className="px-1 text-[11px] uppercase tracking-[0.1em] text-chalk-faint">
            {t("reports.preview")}
          </p>
          <article className="overflow-hidden rounded-xl border border-line-strong bg-gradient-to-b from-ink-3 to-ink-2 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.9)]">
            <div className="h-1 bg-pitch" />
            <div className="p-4 sm:p-5">
              <header className="flex items-start justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-pitch">
                  <Mark size={18} />
                  <span className="font-display text-[13px] font-bold tracking-tight text-chalk">ARIS</span>
                </span>
                <span className="board text-right text-[9.5px] leading-tight text-chalk-faint">
                  {t("reports.reference")}
                  <br />
                  {reference(match.id, match.countryCode)}
                </span>
              </header>

              <p className="mt-4 text-[9.5px] uppercase tracking-[0.16em] text-chalk-faint">
                {t("reports.dossierTitle")}
              </p>
              <h3 className="mt-1 font-display text-[17px] leading-tight font-semibold text-chalk">
                {match.home} <span className="board text-pitch">{match.score}</span> {match.away}
              </h3>
              <p className="mt-1 text-[11.5px] text-chalk-faint">
                {countryFlag(match.countryCode)} {competition?.name} · {fmt.longDate(match.date)}
              </p>
              {referee && (
                <p className="mt-0.5 text-[11.5px] text-chalk-dim">
                  {t("common.referee")}: {referee.name} · {referee.level}
                </p>
              )}

              <div className="my-4 chalk-rule" />

              <div className="grid grid-cols-3 gap-2">
                <Board tone="var" label={t("matchReview.matchArps")} value={match.arpsForMatch} />
                <Board tone="gold" label={t("arae.rmcs")} value={match.rmcs} />
                <Board
                  tone={report && report.state === "filed" ? "pitch" : "amber"}
                  label={t("assessments.overall")}
                  value={report && report.state === "filed" ? report.overall.toFixed(1) : "—"}
                />
              </div>

              <p className="mb-2 mt-4 text-[9.5px] uppercase tracking-[0.16em] text-chalk-faint">
                {t("reports.contents")}
              </p>
              {contents.length === 0 ? (
                <p className="rounded-md border border-dashed border-line px-3 py-4 text-center text-[12px] text-chalk-faint">
                  {t("reports.noSections")}
                </p>
              ) : (
                <ul className="space-y-1">
                  {contents.map(({ section, startsAt }, i) => (
                    <li key={section.id} className="flex items-baseline gap-2 text-[12px]">
                      <span className="board w-5 shrink-0 text-chalk-faint">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="truncate text-chalk-dim">{t(section.labelKey)}</span>
                      <span className="min-w-0 flex-1 translate-y-[-3px] border-b border-dotted border-line" />
                      <span className="board shrink-0 text-[11px] text-chalk-faint">{startsAt}</span>
                    </li>
                  ))}
                </ul>
              )}

              {sections.includes("crew") && fixture && (
                <>
                  <p className="mb-1.5 mt-4 text-[9.5px] uppercase tracking-[0.16em] text-chalk-faint">
                    {t("common.crew")}
                  </p>
                  <CrewStrip crew={fixture.crew} />
                </>
              )}

              <footer className="mt-5 flex items-center justify-between gap-2 border-t border-line pt-3 text-[10px] text-chalk-faint">
                <span className="min-w-0 truncate">{t("reports.confidential")}</span>
                <span className="board shrink-0">{t("reports.pageOf", { n: totalPages })}</span>
              </footer>
            </div>
          </article>

          <p className="px-1 text-[11.5px] leading-relaxed text-chalk-faint">
            {locale === "fr"
              ? "Le dossier réunit l'analyse tactique AfriScout et la qualité d'arbitrage ARIS dans un seul document — ce que ni un outil de désignation ni un fournisseur VAR ne produit aujourd'hui."
              : "The dossier puts AfriScout's tactical analysis and ARIS refereeing quality in one document — something neither an assignment tool nor a VAR vendor produces today."}
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------------ *
       * Archive
       * ------------------------------------------------------------ */}
      <Card padded={false}>
        <div className="p-4 sm:p-5">
          <CardHeader
            icon={Files}
            tint="gold"
            title={t("reports.recent")}
            subtitle={t("reports.recentSub")}
            className="mb-0"
          />
        </div>
        {scopedDossiers.length === 0 ? (
          <div className="px-4 pb-5 sm:px-5">
            <EmptyState title={t("common.empty")} hint={t("calendar.noFixturesHint")} />
          </div>
        ) : (
          <div className="scroll-x">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="border-y border-line bg-ink-1">
                  <Th>{t("reports.reference")}</Th>
                  <Th>{t("common.match")}</Th>
                  <Th>{t("reports.generated")}</Th>
                  <Th className="text-right">{t("reports.pages")}</Th>
                  <Th>{t("reports.recipients")}</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {scopedDossiers.map((dossier) => {
                  const dossierMatch = matchById.get(dossier.matchId);
                  if (!dossierMatch) return null;
                  return (
                    <tr key={dossier.id} className="row-hover border-b border-line last:border-0">
                      <Td className="board whitespace-nowrap text-[11.5px] text-chalk-faint">
                        {reference(dossierMatch.id, dossierMatch.countryCode)}
                      </Td>
                      <Td className="text-chalk">
                        <span className="whitespace-nowrap">
                          {countryFlag(dossierMatch.countryCode)} {dossierMatch.home} — {dossierMatch.away}
                        </span>
                      </Td>
                      <Td className="whitespace-nowrap">{fmt.date(dossier.generated)}</Td>
                      <Td className="board text-right">{dossier.pages}</Td>
                      <Td>
                        <span className="flex flex-wrap gap-1">
                          {dossier.recipients.map((name) => (
                            <Badge key={name}>{name}</Badge>
                          ))}
                        </span>
                      </Td>
                      <Td className="text-right">
                        <Button size="sm" variant="ghost" aria-label={t("common.export")}>
                          <Download size={13} />
                        </Button>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
