"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  CalendarCheck,
  Download,
  Gauge,
  HeartPulse,
  IdCard,
  Scale,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Users,
} from "@/components/icons/glyphs";
import { PageHeading } from "@/components/layout/PageHeading";
import { Badge, Board, Card, CardHeader, EmptyState, Meter, Segmented, Td, Th } from "@/components/ui";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { TextField } from "@/components/admin/fields";
import { ErrorState, ListSkeleton } from "@/components/admin/states";
import {
  csvHref,
  FEE_GROUPS,
  getAbsences,
  getFees,
  getOverview,
  getReconciliation,
  getWorkload,
  type FeeGroup,
  type Range,
} from "@/lib/api/reports";
import {
  confirmationRate,
  feeTotals,
  incidentsByKind,
  issueCounts,
  n,
  presetRange,
  PRESETS,
  validRange,
  workloadSummary,
  type Preset,
} from "@/lib/analytics/rules";
import { useResource } from "@/lib/admin/hooks";
import { useScope } from "@/lib/scope/ScopeProvider";
import { competitionById, refereeHref, roleKey, today, type CrewRole } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useFormatters, useT, type TKey } from "@/lib/i18n/LocaleProvider";

const TABS = ["overview", "workload", "absences", "fees", "reconciliation"] as const;
type Tab = (typeof TABS)[number];

function CsvLink({ href }: { href: string }) {
  const t = useT();
  return (
    <a href={href} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs text-chalk-dim hover:text-chalk">
      <Download size={13} />
      {t("analytics.csv")}
    </a>
  );
}

function Loading({ error, loading, reload }: { error: unknown; loading: boolean; reload: () => void }) {
  if (loading) return <ListSkeleton rows={5} />;
  if (error) return <ErrorState onRetry={reload} />;
  return null;
}

/* ------------------------------------------------------------------ overview */

function OverviewPanel({ country }: { country?: string }) {
  const t = useT();
  const fmt = useFormatters();
  const res = useResource(`overview|${country ?? ""}`, (signal) => getOverview(country, signal));
  if (!res.data) return <Loading error={res.error} loading={res.loading} reload={res.reload} />;
  const o = res.data;
  const rate = confirmationRate(o.designations.slots);
  const totalOfficials = n(o.workforce.referees) + n(o.workforce.assistants);
  const fixtureStates = ["draft", "awaiting_confirmation", "validated", "published"] as const;
  const fixturesTotal = fixtureStates.reduce((s, k) => s + n(o.designations.fixturesByStatus[k]), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Board primary tone="var" icon={Users} label={t("analytics.overview.workforce")} value={totalOfficials} />
        <Board tone="pitch" icon={CalendarCheck} label={t("analytics.overview.availableToday")} value={o.workforce.availableToday} />
        <Board tone="gold" icon={Gauge} label={t("analytics.overview.avgRating")} value={o.performance.avgRating ?? "—"} />
        <Board
          icon={ShieldAlert}
          label={t("analytics.overview.suspended")}
          value={n(o.workforce.suspended)}
          tone={n(o.workforce.suspended) > 0 ? "red" : "chalk"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader icon={Users} tint="var" title={t("analytics.overview.byLevel")} subtitle={t("analytics.overview.byLevelHint", { referees: n(o.workforce.referees), assistants: n(o.workforce.assistants) })} />
          <ul className="space-y-3">
            {o.workforce.byLevel
              .slice()
              .sort((a, b) => b.n - a.n)
              .map((l) => (
                <li key={l.level}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-chalk-dim">{l.level}</span>
                    <span className="board text-chalk">{l.n}</span>
                  </div>
                  <Meter value={totalOfficials ? (l.n / totalOfficials) * 100 : 0} tone="pitch" />
                </li>
              ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            icon={CalendarCheck}
            tint="pitch"
            title={t("analytics.overview.designations")}
            subtitle={rate === null ? t("analytics.overview.noSlots") : t("analytics.overview.confirmed", { n: rate })}
          />
          <ul className="space-y-3">
            {fixtureStates.map((k) => (
              <li key={k}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-chalk-dim">{t(`analytics.fixtureStatus.${k}`)}</span>
                  <span className="board text-chalk">{n(o.designations.fixturesByStatus[k])}</span>
                </div>
                <Meter value={fixturesTotal ? (n(o.designations.fixturesByStatus[k]) / fixturesTotal) * 100 : 0} tone={k === "published" ? "pitch" : k === "draft" ? "amber" : "chalk"} />
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(["pending", "confirmed", "declined"] as const).map((s) => (
              <Badge key={s} tone={s === "confirmed" ? "pitch" : s === "declined" ? "red" : "amber"}>
                {t(`common.${s}`)} · {n(o.designations.slots[s])}
              </Badge>
            ))}
          </div>
        </Card>

        <Card tint={o.compliance.licencesExpired + o.compliance.fitnessFailed + o.compliance.assessmentsOverdue > 0 ? "amber" : undefined}>
          <CardHeader icon={IdCard} tint="amber" title={t("analytics.overview.compliance")} subtitle={t("analytics.overview.complianceHint")} />
          <ul className="space-y-2 text-sm">
            {(
              [
                ["licencesExpired", o.compliance.licencesExpired, "/development?tab=licences", "red"],
                ["licencesExpiring90", o.compliance.licencesExpiring90, "/development?tab=licences", "amber"],
                ["fitnessFailed", o.compliance.fitnessFailed, "/development?tab=fitness", "red"],
                ["assessmentsOverdue", o.compliance.assessmentsOverdue, "/assessments", "red"],
              ] as const
            ).map(([key, value, href, tone]) => (
              <li key={key}>
                <Link href={href} className="flex items-center justify-between rounded-[10px] border border-line bg-ink-1 px-3 py-2 hover:border-field">
                  <span className="text-chalk-dim">{t(`analytics.overview.${key}`)}</span>
                  <Badge tone={value > 0 ? tone : "pitch"}>{value}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader icon={Banknote} tint="gold" title={t("analytics.overview.budget")} subtitle={t("analytics.overview.budgetHint")} />
          {o.budget.length === 0 ? (
            <EmptyState title={t("analytics.overview.noBudget")} />
          ) : (
            <ul className="space-y-3">
              {o.budget.map((b) => (
                <li key={b.currency} className="rounded-[10px] border border-line bg-ink-1 px-3 py-2.5">
                  <p className="mb-1.5 text-xs font-semibold text-chalk">{b.currency}</p>
                  <dl className="grid grid-cols-2 gap-1 text-xs">
                    {(["planned", "committed", "paid", "contested"] as const).map((k) => (
                      <div key={k} className="flex justify-between gap-2">
                        <dt className="text-chalk-faint">{t(`analytics.overview.money.${k}`)}</dt>
                        <dd className="tnum text-chalk">{fmt.number(n(b[k]))}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {(["top", "bottom"] as const).map((which) => (
          <Card key={which}>
            <CardHeader
              icon={which === "top" ? TrendingUp : TrendingDown}
              tint={which === "top" ? "pitch" : "amber"}
              title={t(`analytics.overview.${which}`)}
              subtitle={t("analytics.overview.rankHint")}
            />
            {o.performance[which].length === 0 ? (
              <EmptyState title={t("common.noResults")} />
            ) : (
              <ol className="space-y-1.5">
                {o.performance[which].map((r, i) => (
                  <li key={r.id}>
                    <Link href={refereeHref(r.id)} className="flex items-center gap-2 rounded-[10px] border border-line bg-ink-1 px-3 py-2 hover:border-field">
                      <span className="board w-4 text-xs text-chalk-faint">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-chalk">
                        <CountryFlag code={r.countryCode} /> {r.name}
                      </span>
                      <span className="board text-sm text-chalk">{n(r.rating).toFixed(1)}</span>
                      <span className={cn("tnum w-10 text-right text-xs", n(r.trend) >= 0 ? "text-pitch" : "text-card-red")}>
                        {n(r.trend) >= 0 ? "+" : "−"}
                        {Math.abs(n(r.trend)).toFixed(1)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        ))}
      </div>
      <p className="text-xs text-chalk-faint">{t("analytics.asOf", { date: fmt.longDate(o.asOf) })}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ workload */

function WorkloadPanel({ range }: { range: Range }) {
  const t = useT();
  const fmt = useFormatters();
  const res = useResource(`workload|${range.from}|${range.to}|${range.country ?? ""}`, (signal) => getWorkload(range, signal));
  const [only, setOnly] = useState<"all" | "flagged">("all");
  const rows = useMemo(() => (res.data?.rows ?? []).filter((r) => only === "all" || r.flag), [res.data, only]);
  if (!res.data) return <Loading error={res.error} loading={res.loading} reload={res.reload} />;
  const s = workloadSummary(res.data.rows);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Board primary tone="var" icon={CalendarCheck} label={t("analytics.workload.appointments")} value={s.appointments} />
        <Board tone="gold" icon={BarChart3} label={t("analytics.workload.mean")} value={res.data.mean} />
        <Board icon={AlertTriangle} label={t("analytics.workload.overused")} value={s.overused} tone={s.overused ? "amber" : "pitch"} />
        <Board icon={Users} label={t("analytics.workload.unused")} value={s.unused} tone={s.unused ? "amber" : "pitch"} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          value={only}
          onChange={setOnly}
          options={[
            { value: "all" as const, label: t("analytics.workload.all") },
            { value: "flagged" as const, label: t("analytics.workload.flagged") },
          ]}
        />
        <CsvLink href={csvHref("workload", range)} />
      </div>
      {rows.length === 0 ? (
        <Card>
          <EmptyState title={t("common.noResults")} />
        </Card>
      ) : (
        <Card padded={false}>
          <div className="scroll-x">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="border-b border-line">
                  <Th>{t("common.official")}</Th>
                  <Th className="text-right">{t("analytics.workload.appointments")}</Th>
                  <Th className="text-right">{t("analytics.workload.asReferee")}</Th>
                  <Th>{t("analytics.workload.last")}</Th>
                  <Th>{t("analytics.workload.next")}</Th>
                  <Th>{t("analytics.workload.flag")}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.officialId} className="border-b border-line last:border-0 row-hover">
                    <Td>
                      <Link href={refereeHref(r.officialId)} className="hover:underline">
                        <CountryFlag code={r.countryCode} /> {r.name}
                      </Link>
                      <span className="ms-2 text-[11px] text-chalk-faint">{t(`officials.kinds.${r.kind}`)}</span>
                    </Td>
                    <Td className="board text-right text-chalk">{r.appointments}</Td>
                    <Td className="tnum text-right">{r.asReferee}</Td>
                    <Td className="text-chalk-faint">{r.lastDate ? fmt.date(r.lastDate) : "—"}</Td>
                    <Td className="text-chalk-faint">{r.nextDate ? fmt.date(r.nextDate) : "—"}</Td>
                    <Td>{r.flag && <Badge tone="amber">{t(`analytics.workload.flags.${r.flag}`)}</Badge>}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <p className="text-xs text-chalk-faint">{t("analytics.workload.note")}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ absences */

function AbsencesPanel({ range }: { range: Range }) {
  const t = useT();
  const res = useResource(`absences|${range.from}|${range.to}|${range.country ?? ""}`, (signal) => getAbsences(range, signal));
  if (!res.data) return <Loading error={res.error} loading={res.loading} reload={res.reload} />;
  const a = res.data;
  const kinds = incidentsByKind(a.incidents);
  const incidents = kinds.reduce((s, k) => s + k.count, 0);
  const open = a.incidents.filter((i) => i.status !== "closed").reduce((s, i) => s + n(i.n), 0);
  const max = Math.max(1, ...kinds.map((k) => k.count));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Board primary tone="var" icon={ShieldAlert} label={t("analytics.absences.incidents")} value={incidents} />
        <Board icon={AlertTriangle} label={t("analytics.absences.open")} value={open} tone={open ? "amber" : "pitch"} />
        <Board tone="gold" icon={CalendarCheck} label={t("analytics.absences.refusals")} value={a.refusals} />
        <Board icon={Users} label={t("analytics.absences.replacements")} value={a.replacements} />
      </div>
      <div className="flex justify-end">
        <CsvLink href={csvHref("absences", range)} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader icon={ShieldAlert} tint="amber" title={t("analytics.absences.byKind")} />
          {kinds.length === 0 ? (
            <EmptyState title={t("analytics.absences.none")} />
          ) : (
            <ul className="space-y-3">
              {kinds.map((k) => (
                <li key={k.kind}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-chalk-dim">{t(`discipline.kinds.${k.kind}` as TKey)}</span>
                    <span className="board text-chalk">{k.count}</span>
                  </div>
                  <Meter value={(k.count / max) * 100} tone="amber" />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader icon={Scale} tint="red" title={t("analytics.absences.sanctions")} subtitle={t("analytics.absences.sanctionsHint")} />
          {a.sanctions.length === 0 ? (
            <EmptyState title={t("analytics.absences.noSanctions")} />
          ) : (
            <ul className="space-y-2">
              {a.sanctions.map((s) => (
                <li key={s.sanction} className="flex items-center justify-between rounded-[10px] border border-line bg-ink-1 px-3 py-2 text-sm">
                  <span className="text-chalk-dim">{t(`discipline.sanctions.${s.sanction}` as TKey)}</span>
                  <span className="board text-chalk">{s.n}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/discipline" className="mt-3 inline-block text-xs text-chalk-faint hover:text-chalk">
            {t("analytics.absences.toDiscipline")}
          </Link>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ fees */

function FeesPanel({ range }: { range: Range }) {
  const t = useT();
  const fmt = useFormatters();
  const [group, setGroup] = useState<FeeGroup>("official");
  const res = useResource(`fees|${range.from}|${range.to}|${range.country ?? ""}|${group}`, (signal) => getFees(range, group, signal));
  const label = (key: string) => {
    if (group === "competition") return competitionById.get(key)?.name ?? key;
    if (group === "day") return fmt.date(key);
    return key || "—";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented value={group} onChange={setGroup} options={FEE_GROUPS.map((g) => ({ value: g, label: t(`analytics.fees.by.${g}`) }))} />
        <CsvLink href={csvHref("fees", range, { groupBy: group })} />
      </div>
      {!res.data ? (
        <Loading error={res.error} loading={res.loading} reload={res.reload} />
      ) : res.data.length === 0 ? (
        <Card>
          <EmptyState title={t("analytics.fees.none")} hint={t("analytics.fees.noneHint")} />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {feeTotals(res.data).map((c) => (
              <Card key={c.currency}>
                <p className="text-xs text-chalk-faint">{t("analytics.fees.totalIn", { currency: c.currency })}</p>
                <p className="board mt-1 text-2xl text-chalk">{fmt.number(c.total)}</p>
                <Meter className="mt-2" value={c.total ? (c.paid / c.total) * 100 : 0} tone="pitch" />
                <p className="mt-1.5 text-[11px] text-chalk-faint">
                  {t("analytics.fees.paidShare", { paid: fmt.number(c.paid), due: fmt.number(c.due + c.validated), lines: c.lines })}
                </p>
              </Card>
            ))}
          </div>
          <Card padded={false}>
            <div className="scroll-x">
              <table className="w-full min-w-[720px] border-collapse">
                <thead>
                  <tr className="border-b border-line">
                    <Th>{t(`analytics.fees.by.${group}`)}</Th>
                    <Th className="text-right">{t("analytics.fees.lines")}</Th>
                    <Th className="text-right">{t("analytics.fees.total")}</Th>
                    <Th className="text-right">{t("analytics.overview.money.paid")}</Th>
                    <Th className="text-right">{t("analytics.fees.validated")}</Th>
                    <Th className="text-right">{t("analytics.overview.money.planned")}</Th>
                    <Th className="text-right">{t("analytics.overview.money.contested")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {res.data.map((r) => (
                    <tr key={`${r.key}|${r.currency}`} className="border-b border-line last:border-0 row-hover">
                      <Td className="max-w-72 truncate text-chalk">{label(r.key)}</Td>
                      <Td className="tnum text-right">{r.lines}</Td>
                      <Td className="board text-right text-chalk">
                        {fmt.number(n(r.total))} <span className="text-[11px] text-chalk-faint">{r.currency}</span>
                      </Td>
                      <Td className="tnum text-right">{fmt.number(n(r.paid))}</Td>
                      <Td className="tnum text-right">{fmt.number(n(r.validated))}</Td>
                      <Td className="tnum text-right">{fmt.number(n(r.due))}</Td>
                      <Td className={cn("tnum text-right", n(r.contested) > 0 && "text-card-red")}>{fmt.number(n(r.contested))}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ reconciliation */

function ReconciliationPanel({ range }: { range: Range }) {
  const t = useT();
  const fmt = useFormatters();
  const res = useResource(`reconciliation|${range.from}|${range.to}|${range.country ?? ""}`, (signal) => getReconciliation(range, signal));
  if (!res.data) return <Loading error={res.error} loading={res.loading} reload={res.reload} />;
  const counts = issueCounts(res.data.issues);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Board primary tone="var" icon={HeartPulse} label={t("analytics.reconciliation.checked")} value={res.data.checked} />
        {(Object.keys(counts) as Array<keyof typeof counts>).map((k) => (
          <Board key={k} icon={AlertTriangle} label={t(`analytics.reconciliation.issues.${k}`)} value={counts[k]} tone={counts[k] ? "red" : "pitch"} />
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-chalk-faint">{t("analytics.reconciliation.hint")}</p>
        <CsvLink href={csvHref("reconciliation", range)} />
      </div>
      {res.data.issues.length === 0 ? (
        <Card>
          <EmptyState title={t("analytics.reconciliation.clean")} hint={t("analytics.reconciliation.cleanHint", { n: res.data.checked })} />
        </Card>
      ) : (
        <Card padded={false}>
          <div className="scroll-x">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr className="border-b border-line">
                  <Th>{t("analytics.reconciliation.match")}</Th>
                  <Th>{t("common.official")}</Th>
                  <Th>{t("analytics.reconciliation.role")}</Th>
                  <Th>{t("analytics.reconciliation.payment")}</Th>
                  <Th>{t("analytics.reconciliation.issue")}</Th>
                </tr>
              </thead>
              <tbody>
                {res.data.issues.map((i) => (
                  <tr key={`${i.fixtureId}|${i.role}`} className="border-b border-line last:border-0 row-hover">
                    <Td>
                      <p className="text-chalk">
                        {i.home} — {i.away}
                      </p>
                      <p className="text-[11px] text-chalk-faint">{fmt.date(i.date)}</p>
                    </Td>
                    <Td>
                      <CountryFlag code={i.countryCode} /> {i.officialName}
                    </Td>
                    <Td>{i.role in roleKey ? t(roleKey[i.role as CrewRole]) : i.role}</Td>
                    <Td className="tnum">{i.total !== null && i.currency ? `${fmt.number(i.total)} ${i.currency}` : "—"}</Td>
                    <Td>
                      <Link href={i.issue === "played-not-billed" ? "/finance" : "/finance?status=paid"}>
                        <Badge tone="red">{t(`analytics.reconciliation.issues.${i.issue}`)}</Badge>
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ the page */

/** The dashboards the federation reads: workforce, workload, absences, fees and the payments control. */
export function AnalyticsView() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { scope, lockedTo } = useScope();
  // a federation seat is confined by the Worker; an administrator narrows with the scope picker
  const country = lockedTo ? undefined : scope.kind === "country" ? scope.code : undefined;
  const tabParam = params.get("tab");
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as Tab) : "overview";
  const [preset, setPreset] = useState<Preset | "custom">("around30");
  const [custom, setCustom] = useState(() => presetRange("around30", today()));
  const span = preset === "custom" ? custom : presetRange(preset, today());
  const ok = validRange(span);
  const range: Range = { ...span, country };

  const go = (next: Tab) => {
    const q = new URLSearchParams(params.toString());
    if (next === "overview") q.delete("tab");
    else q.set("tab", next);
    router.replace(`${pathname}${q.size ? `?${q.toString()}` : ""}`, { scroll: false });
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeading titleKey="analytics.title" subtitleKey="subtitles.analytics" />

      <div className="scroll-x -mx-4 px-4 lg:mx-0 lg:px-0">
        <Segmented value={tab} onChange={go} options={TABS.map((x) => ({ value: x, label: t(`analytics.tabs.${x}`) }))} />
      </div>

      {tab !== "overview" && (
        <Card>
          <div className="flex flex-wrap items-end gap-3">
            <Segmented
              value={preset}
              onChange={(p) => {
                if (p === "custom") setCustom(span);
                setPreset(p);
              }}
              options={[...PRESETS.map((p) => ({ value: p, label: t(`analytics.presets.${p}`) })), { value: "custom" as const, label: t("analytics.presets.custom") }]}
            />
            {preset === "custom" && (
              <>
                <TextField className="w-40" type="date" label={t("analytics.from")} value={custom.from} onChange={(v) => setCustom((c) => ({ ...c, from: v }))} />
                <TextField className="w-40" type="date" label={t("analytics.to")} value={custom.to} onChange={(v) => setCustom((c) => ({ ...c, to: v }))} />
              </>
            )}
          </div>
          {!ok && <p className="mt-2 text-xs text-card-red">{t("analytics.badRange")}</p>}
        </Card>
      )}

      {tab === "overview" ? (
        <OverviewPanel country={country} />
      ) : !ok ? null : tab === "workload" ? (
        <WorkloadPanel range={range} />
      ) : tab === "absences" ? (
        <AbsencesPanel range={range} />
      ) : tab === "fees" ? (
        <FeesPanel range={range} />
      ) : (
        <ReconciliationPanel range={range} />
      )}
    </div>
  );
}
