"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCcw, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFormatters, useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { useScope } from "@/lib/scope/ScopeProvider";
import { useAppointments } from "@/lib/appointments/AppointmentsProvider";
import { PageHeading } from "@/components/layout/PageHeading";
import { Badge, Board, Button, Card, CardHeader, EmptyState, Segmented, Th } from "@/components/ui";
import { CrewStrip } from "@/components/officiating/CrewStrip";
import { SlotPicker } from "@/components/officiating/SlotPicker";
import {
  SEASON,
  assistants,
  availabilityFor,
  competitionById,
  countries,
  countryFlag,
  countryName,
  crewRoles,
  fixtures,
  officialById,
  referees,
  roleKey,
  weekDates,
  weekStarts,
  type AvailabilityState,
  type CrewRole,
  type CrewSlot,
  type Fixture,
} from "@/lib/mock-data";

type View = "list" | "board" | "availability";

const availabilityTone: Record<AvailabilityState, string> = {
  available: "bg-pitch/15 text-pitch border-pitch/25",
  assigned: "bg-pitch text-[#04140c] border-pitch",
  resting: "bg-white/[0.05] text-chalk-faint border-line",
  travelling: "bg-var/12 text-var border-var/25",
  unavailable: "bg-card-red/12 text-card-red border-card-red/25",
};

const availabilityKey: Record<AvailabilityState, "common.available" | "common.assigned" | "common.resting" | "common.travelling" | "common.unavailable"> = {
  available: "common.available",
  assigned: "common.assigned",
  resting: "common.resting",
  travelling: "common.travelling",
  unavailable: "common.unavailable",
};

export default function CalendarPage() {
  const t = useT();
  const { locale } = useLocale();
  const fmt = useFormatters();
  const { matches: inScope, codes } = useScope();
  const { crewFor, assign, clear, autoFill, undoAutoFill } = useAppointments();

  const [weekIndex, setWeekIndex] = useState(1);
  const [view, setView] = useState<View>("list");
  const [picking, setPicking] = useState<{ fixture: Fixture; role: CrewRole } | null>(null);
  const [autoFilled, setAutoFilled] = useState<number | null>(null);

  const weekStart = weekStarts[weekIndex];
  const dates = weekDates(weekStart);

  const weekFixtures = useMemo(
    () =>
      fixtures
        .filter((f) => inScope(f.countryCode) && f.date >= dates[0] && f.date <= dates[6])
        .sort((a, b) => (a.date === b.date ? b.importance - a.importance : a.date.localeCompare(b.date))),
    [inScope, dates],
  );

  const openFor = (fixture: Fixture) =>
    crewFor(fixture).filter((s) => s.role !== "OBS" && (s.state === "empty" || s.state === "declined")).length;

  const totals = useMemo(() => {
    const open = weekFixtures.reduce((s, f) => s + openFor(f), 0);
    const complete = weekFixtures.filter((f) => openFor(f) === 0).length;
    return { open, complete };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekFixtures, crewFor]);

  const byDate = useMemo(() => {
    const map = new Map<string, Fixture[]>();
    weekFixtures.forEach((f) => {
      map.set(f.date, [...(map.get(f.date) ?? []), f]);
    });
    return [...map.entries()];
  }, [weekFixtures]);

  const scopedCountries = countries.filter((c) => codes.includes(c.code));

  function runAutoFill() {
    const filled = autoFill(weekFixtures);
    setAutoFilled(filled);
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeading titleKey="calendar.title" subtitleKey="subtitles.calendar" />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-md border border-line bg-ink-1 p-0.5">
          <button
            onClick={() => setWeekIndex((i) => Math.max(0, i - 1))}
            disabled={weekIndex === 0}
            aria-label={t("calendar.prevWeek")}
            className="rounded-[5px] p-1.5 text-chalk-faint hover:text-chalk disabled:opacity-30"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="flex items-center gap-1.5 px-2 text-[12.5px] text-chalk">
            <CalendarDays size={13} className="text-chalk-faint" />
            {fmt.date(dates[0])} — {fmt.date(dates[6])}
          </span>
          <button
            onClick={() => setWeekIndex((i) => Math.min(weekStarts.length - 1, i + 1))}
            disabled={weekIndex === weekStarts.length - 1}
            aria-label={t("calendar.nextWeek")}
            className="rounded-[5px] p-1.5 text-chalk-faint hover:text-chalk disabled:opacity-30"
          >
            <ChevronRight size={15} />
          </button>
        </div>

        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "list", label: t("calendar.listView") },
            { value: "board", label: t("calendar.boardView") },
            { value: "availability", label: t("calendar.availabilityView") },
          ]}
        />

        <div className="ml-auto flex items-center gap-2">
          {autoFilled !== null && (
            <>
              <span className="hidden text-[12px] text-chalk-faint sm:inline">
                {autoFilled > 0 ? t("calendar.autoFillDone", { n: autoFilled }) : t("calendar.autoFillNone")}
              </span>
              {autoFilled > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    undoAutoFill();
                    setAutoFilled(null);
                  }}
                >
                  {t("calendar.undoAutoFill")}
                </Button>
              )}
            </>
          )}
          <Button size="sm" variant="primary" onClick={runAutoFill} disabled={totals.open === 0}>
            <Wand2 size={13} />
            {t("calendar.autoFill")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Board primary label={t("calendar.fixtures")} value={weekFixtures.length} hint={`${t("common.season")} ${SEASON}`} />
        <Board label={t("common.confirmed")} value={totals.complete} tone="pitch" />
        <Board label={t("calendar.slotsOpen")} value={totals.open} tone={totals.open ? "amber" : "pitch"} />
        <Board label={t("common.competitions")} value={new Set(weekFixtures.map((f) => f.competitionId)).size} />
      </div>

      {weekFixtures.length === 0 ? (
        <Card>
          <EmptyState title={t("calendar.noFixtures")} hint={t("calendar.noFixturesHint")} />
        </Card>
      ) : view === "list" ? (
        <div className="space-y-4">
          {byDate.map(([date, list]) => (
            <Card key={date} padded={false}>
              <div className="flex items-center justify-between gap-2 px-4 py-2.5">
                <h2 className="font-display text-[13.5px] font-semibold text-chalk">{fmt.longDate(date)}</h2>
                <span className="text-[11.5px] text-chalk-faint">
                  {list.length} {t("calendar.fixtures")}
                </span>
              </div>
              <div className="chalk-rule" />
              <ul>
                {list.map((fixture) => {
                  const crew = crewFor(fixture);
                  const comp = competitionById.get(fixture.competitionId);
                  const open = openFor(fixture);
                  return (
                    <li
                      key={fixture.id}
                      className="flex flex-col gap-3 border-b border-line px-4 py-3 last:border-0 row-hover xl:flex-row xl:items-center"
                    >
                      <div className="min-w-0 xl:w-[38%]">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px]">{countryFlag(fixture.countryCode)}</span>
                          <p className="truncate text-[13.5px] font-medium text-chalk">
                            {fixture.home} <span className="text-chalk-faint">—</span> {fixture.away}
                          </p>
                        </div>
                        <p className="mt-0.5 truncate text-[11.5px] text-chalk-faint">
                          {comp?.name} · {t("common.matchday")} {fixture.matchday} · {fixture.venue}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 xl:w-[16%]">
                        <span className="board text-[13px] text-chalk">{fixture.kickoff}</span>
                        <Badge tone={fixture.risk === "high" ? "red" : fixture.risk === "medium" ? "amber" : "neutral"}>
                          {t("calendar.importance")} {fixture.importance}
                        </Badge>
                      </div>

                      <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                        <CrewStrip
                          crew={crew}
                          onSlotClick={(slot) => setPicking({ fixture, role: slot.role })}
                        />
                        <span
                          className={cn(
                            "shrink-0 text-[11.5px]",
                            open === 0 ? "text-pitch" : "text-card-red",
                          )}
                        >
                          {open === 0 ? t("common.confirmed") : `${open} ${t("calendar.slotsOpen")}`}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      ) : view === "board" ? (
        <Card padded={false}>
          <div className="px-4 py-3">
            <CardHeader title={t("calendar.board")} subtitle={t("calendar.boardSub")} className="mb-0" />
          </div>
          <div className="chalk-rule" />
          <div className="scroll-x">
            <table className="w-full min-w-[880px] border-collapse">
              <thead>
                <tr className="border-b border-line">
                  <Th className="sticky left-0 z-10 bg-ink-2">{t("common.match")}</Th>
                  {crewRoles.map((role) => (
                    <Th key={role} className="text-center">
                      {role === "FOURTH" ? "4TH" : role}
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weekFixtures.map((fixture) => {
                  const crew = crewFor(fixture);
                  return (
                    <tr key={fixture.id} className="border-b border-line last:border-0 row-hover">
                      <td className="sticky left-0 z-10 bg-ink-2 px-3 py-2.5">
                        <p className="truncate text-[12.5px] text-chalk">
                          {countryFlag(fixture.countryCode)} {fixture.home} — {fixture.away}
                        </p>
                        <p className="text-[10.5px] text-chalk-faint">
                          {fmt.date(fixture.date)} · {fixture.kickoff}
                        </p>
                      </td>
                      {crewRoles.map((role) => {
                        const slot = crew.find((s) => s.role === role);
                        if (!slot) {
                          return (
                            <td key={role} className="px-2 py-2 text-center text-[11px] text-chalk-faint">
                              ·
                            </td>
                          );
                        }
                        return (
                          <td key={role} className="px-2 py-2">
                            <BoardCell
                              slot={slot}
                              onClick={() => setPicking({ fixture, role })}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-2.5 text-[11px] text-chalk-faint">
            <Legend tone="bg-pitch" label={t("common.confirmed")} />
            <Legend tone="bg-amber" label={t("common.pending")} />
            <Legend tone="bg-card-red" label={t("common.declined")} />
            <span className="inline-flex items-center gap-1.5">
              <span className="slot-empty inline-block h-3 w-6 rounded-[3px]" />
              {t("common.unassigned")}
            </span>
          </div>
        </Card>
      ) : (
        <Card padded={false}>
          <div className="px-4 py-3">
            <CardHeader title={t("calendar.availabilityTitle")} subtitle={t("calendar.availabilitySub")} className="mb-0" />
          </div>
          <div className="chalk-rule" />
          <div className="scroll-x">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr className="border-b border-line">
                  <Th className="sticky left-0 z-10 bg-ink-2">{t("common.official")}</Th>
                  {dates.map((date) => (
                    <Th key={date} className="text-center">
                      {fmt.weekday(date)} {fmt.date(date).split(" ")[0]}
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ...referees.filter((r) => codes.includes(r.countryCode)),
                  ...assistants.filter((a) => codes.includes(a.countryCode)).slice(0, 12),
                ]
                  .slice(0, 26)
                  .map((official) => (
                    <tr key={official.id} className="border-b border-line last:border-0 row-hover">
                      <td className="sticky left-0 z-10 bg-ink-2 px-3 py-2">
                        <p className="truncate text-[12.5px] text-chalk">
                          {countryFlag(official.countryCode)} {official.name}
                        </p>
                        <p className="text-[10.5px] text-chalk-faint">{official.level}</p>
                      </td>
                      {dates.map((date) => {
                        const state = availabilityFor(official.id, date);
                        return (
                          <td key={date} className="px-1.5 py-2 text-center">
                            <span
                              title={t(availabilityKey[state])}
                              className={cn(
                                "inline-block w-full rounded-[4px] border px-1 py-1 text-[10px] font-medium",
                                availabilityTone[state],
                              )}
                            >
                              {t(availabilityKey[state]).slice(0, 3)}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title={t("calendar.syncStatus")}
          subtitle={t("calendar.syncStatusSub")}
          action={
            <Button size="sm" variant="secondary">
              <RefreshCcw size={12} />
              {t("common.syncNow")}
            </Button>
          }
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {scopedCountries.map((country) => (
            <div key={country.code} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-ink-1 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[12.5px] text-chalk">
                  {country.flag} {countryName(country.code, locale)}
                </p>
                <p className="text-[11px] text-chalk-faint">
                  {country.syncSource} · {t("common.lastSync")} {country.lastSyncHours}
                  {t("common.hours")}
                </p>
              </div>
              <Badge
                tone={country.syncHealth === "healthy" ? "pitch" : country.syncHealth === "stale" ? "amber" : "neutral"}
              >
                {t(
                  country.syncHealth === "healthy"
                    ? "federations.syncHealthy"
                    : country.syncHealth === "stale"
                      ? "federations.syncStale"
                      : "federations.syncManual",
                )}
              </Badge>
            </div>
          ))}
        </div>
      </Card>

      {picking && (
        <SlotPicker
          fixture={picking.fixture}
          role={picking.role}
          crew={crewFor(picking.fixture)}
          onPick={(officialId) => {
            assign(picking.fixture.id, picking.role, officialId);
            setPicking(null);
          }}
          onClear={() => {
            clear(picking.fixture.id, picking.role);
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}

function BoardCell({ slot, onClick }: { slot: CrewSlot; onClick: () => void }) {
  const t = useT();
  const official = slot.officialId ? officialById(slot.officialId) : undefined;
  const tone =
    slot.state === "confirmed"
      ? "border-line bg-ink-3 text-chalk"
      : slot.state === "pending"
        ? "border-amber/40 bg-amber/[0.08] text-amber"
        : slot.state === "declined"
          ? "border-card-red/45 bg-card-red/[0.08] text-card-red"
          : "slot-empty text-chalk-faint";

  return (
    <button
      onClick={onClick}
      title={`${t(roleKey[slot.role])} — ${official?.name ?? t("common.unassigned")}`}
      className={cn(
        "w-full rounded-[5px] border px-1.5 py-1.5 text-center text-[11px] transition-colors hover:border-pitch/60",
        tone,
      )}
    >
      {official ? official.initials : "+"}
    </button>
  );
}

function Legend({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2 w-2 rounded-full", tone)} />
      {label}
    </span>
  );
}
