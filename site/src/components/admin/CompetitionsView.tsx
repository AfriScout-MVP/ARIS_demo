"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Pencil, Plus, RefreshCcw, Trophy } from "@/components/icons/glyphs";
import { Badge, Button, Card, EmptyState, Meter, Segmented, Td, Th } from "@/components/ui";
import { listCountries } from "@/lib/api/admin";
import {
  createCompetition,
  listCompetitions,
  updateCompetition,
  type CompetitionRow,
} from "@/lib/api/competitions";
import {
  CONTINENTAL,
  emptyCompetition,
  fromCompetition,
  hasNextSeason,
  nextSeason,
  progress,
  rolloverBody,
  tiersFor,
  toCompetitionBody,
  toCompetitionPatch,
  validateCompetition,
  type CompetitionErrors,
  type CompetitionField,
  type CompetitionValues,
} from "@/lib/competitions/forms";
import { isAdmin, type Actor } from "@/lib/admin/actor";
import { matches } from "@/lib/admin/filters";
import { useAction, useActor, useResource } from "@/lib/admin/hooks";
import { countryLabel } from "@/lib/admin/labels";
import { useDataset } from "@/lib/dataset/DatasetProvider";
import { countryName, today } from "@/lib/store";
import { useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";
import { AdminPage } from "./AdminPage";
import { ConfirmDialog } from "./ConfirmDialog";
import { Dialog } from "./Dialog";
import { fieldMessage, FormError, SelectField, Switch, TextField } from "./fields";
import { RowMenu } from "./RowMenu";
import { ErrorState, ListSkeleton, ResultsLive } from "./states";
import { SearchBox } from "./Toolbar";

type View = "active" | "all";

function CompetitionDialog({
  country,
  competition,
  onClose,
  onDone,
}: {
  country: string;
  competition?: CompetitionRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const { busy, error, serverFields, run } = useAction();
  const [values, setValues] = useState<CompetitionValues>(() => (competition ? fromCompetition(competition) : emptyCompetition(country, today())));
  const [errors, setErrors] = useState<CompetitionErrors>({});
  const set = <K extends keyof CompetitionValues>(key: K, value: CompetitionValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const msg = (f: CompetitionField) => fieldMessage(t, errors, serverFields, f);

  async function submit() {
    const found = validateCompetition(values, country);
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    if (competition) {
      const patch = toCompetitionPatch(values, competition);
      if (Object.keys(patch).length === 0) return onClose();
      const res = await run(() => updateCompetition(competition.id, patch));
      if (res.ok) {
        toast.push("success", t("competitions.saved"));
        onDone();
      }
      return;
    }
    const res = await run(() => createCompetition(toCompetitionBody(values, country)));
    if (res.ok) {
      toast.push("success", t("competitions.created", { name: res.value.name }));
      onDone();
    }
  }

  return (
    <Dialog
      title={t(competition ? "competitions.editTitle" : "competitions.newTitle")}
      description={competition ? `${competition.name} · ${competition.season}` : t("competitions.newHint")}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      footer={
        <>
          <Button type="button" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? t("admin.common.working") : t(competition ? "common.save" : "competitions.create")}
          </Button>
        </>
      }
    >
      <FormError error={error} />
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <TextField label={t("competitions.fields.name")} value={values.name} onChange={(v) => set("name", v)} error={msg("name")} required maxLength={120} autoComplete="off" />
        <TextField label={t("competitions.fields.shortName")} value={values.shortName} onChange={(v) => set("shortName", v)} error={msg("shortName")} maxLength={30} autoComplete="off" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          label={t("competitions.fields.tier")}
          value={values.tier}
          onChange={(v) => set("tier", v as CompetitionValues["tier"])}
          error={msg("tier")}
          options={tiersFor(country).map((tier) => ({ value: tier, label: t(`finance.tiers.${tier}`) }))}
        />
        <SelectField
          label={t("competitions.fields.gender")}
          value={values.gender}
          onChange={(v) => set("gender", v as "M" | "W")}
          disabled={Boolean(competition)}
          options={[
            { value: "M", label: t("competitions.gender.M") },
            { value: "W", label: t("competitions.gender.W") },
          ]}
        />
        <TextField
          label={t("competitions.fields.season")}
          value={values.season}
          onChange={(v) => set("season", v)}
          error={msg("season")}
          disabled={Boolean(competition)}
          hint={competition ? t("competitions.hints.seasonFixed") : t("competitions.hints.season")}
          placeholder="2026/2027"
          maxLength={9}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label={t("competitions.fields.matchdays")} inputMode="numeric" value={values.matchdays} onChange={(v) => set("matchdays", v)} error={msg("matchdays")} maxLength={3} />
        <TextField
          label={t("competitions.fields.currentMatchday")}
          inputMode="numeric"
          value={values.currentMatchday}
          onChange={(v) => set("currentMatchday", v)}
          error={msg("currentMatchday")}
          maxLength={3}
        />
        <TextField
          label={t("competitions.fields.weight")}
          inputMode="decimal"
          value={values.weight}
          onChange={(v) => set("weight", v)}
          error={msg("weight")}
          hint={t("competitions.hints.weight")}
          maxLength={5}
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4 rounded-[10px] border border-line bg-ink-1 px-3 py-2.5">
          <div>
            <p className="text-sm text-chalk">{t("competitions.fields.varEnabled")}</p>
            <p className="text-xs text-chalk-faint">{t("competitions.hints.var")}</p>
          </div>
          <Switch checked={values.varEnabled} onChange={(v) => set("varEnabled", v)} label={t("competitions.fields.varEnabled")} />
        </div>
        <div className="flex items-center justify-between gap-4 rounded-[10px] border border-line bg-ink-1 px-3 py-2.5">
          <div>
            <p className="text-sm text-chalk">{t("competitions.fields.isActive")}</p>
            <p className="text-xs text-chalk-faint">{t("competitions.hints.active")}</p>
          </div>
          <Switch checked={values.isActive} onChange={(v) => set("isActive", v)} label={t("competitions.fields.isActive")} />
        </div>
      </div>
    </Dialog>
  );
}

function RolloverDialog({ competition, onCancel, onDone }: { competition: CompetitionRow; onCancel: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const [closeOld, setCloseOld] = useState(true);
  const next = nextSeason(competition.season);
  return (
    <ConfirmDialog
      title={t("competitions.rollover.title", { season: next })}
      confirmLabel={t("competitions.rollover.confirm")}
      perform={async () => {
        await createCompetition(rolloverBody(competition));
        if (closeOld && competition.isActive) await updateCompetition(competition.id, { isActive: false });
      }}
      onCancel={onCancel}
      onDone={() => {
        toast.push("success", t("competitions.rollover.done", { name: competition.name, season: next }));
        onDone();
      }}
    >
      <p>{t("competitions.rollover.body", { name: competition.name, from: competition.season, to: next })}</p>
      {competition.isActive && (
        <div className="mt-3 flex items-center justify-between gap-4 rounded-[10px] border border-line bg-ink-1 px-3 py-2.5">
          <span className="text-sm text-chalk">{t("competitions.rollover.closeOld", { season: competition.season })}</span>
          <Switch checked={closeOld} onChange={setCloseOld} label={t("competitions.rollover.closeOld", { season: competition.season })} />
        </div>
      )}
    </ConfirmDialog>
  );
}

/** Competitions and seasons. A federation keeps its own country's; an administrator any country's and CAF's. */
export function CompetitionsView() {
  const t = useT();
  const { locale } = useLocale();
  const toast = useToast();
  const { refresh } = useDataset();
  const actor = useActor() as Actor;
  const admin = isAdmin(actor);

  const countries = useResource("countries", (signal) => listCountries(false, signal), admin);
  const [picked, setPicked] = useState("");
  const country = admin ? picked || countries.data?.[0]?.code || "" : (actor.country ?? "");
  const [view, setView] = useState<View>("active");
  const [q, setQ] = useState("");
  const [dialog, setDialog] = useState<CompetitionRow | "new" | null>(null);
  const [rolling, setRolling] = useState<CompetitionRow | null>(null);
  const quick = useAction();

  const list = useResource(`competitions|${country}`, (signal) => listCompetitions(country, signal), country !== "");
  const all = useMemo(() => list.data ?? [], [list.data]);
  const rows = useMemo(
    () =>
      all
        .filter((c) => view === "all" || c.isActive)
        .filter((c) => matches([c.name, c.shortName, c.season], q))
        .sort((a, b) => b.season.localeCompare(a.season) || a.tier.localeCompare(b.tier) || a.name.localeCompare(b.name)),
    [all, view, q],
  );

  const changed = () => {
    setDialog(null);
    setRolling(null);
    list.reload();
    void refresh(); // the calendar, designations and fee scales read competitions from the snapshot
  };

  async function advance(c: CompetitionRow) {
    const res = await quick.run(() => updateCompetition(c.id, { currentMatchday: c.currentMatchday + 1 }));
    if (res.ok) {
      toast.push("success", t("competitions.advanced", { name: c.name, n: c.currentMatchday + 1 }));
      changed();
    } else toast.push("error", t("admin.errors.generic"));
  }

  async function toggleActive(c: CompetitionRow) {
    const res = await quick.run(() => updateCompetition(c.id, { isActive: !c.isActive }));
    if (res.ok) {
      toast.push("success", t(c.isActive ? "competitions.closed" : "competitions.reopened", { name: c.name }));
      changed();
    } else toast.push("error", t("admin.errors.generic"));
  }

  const menu = (c: CompetitionRow) => (
    <RowMenu
      label={t("competitions.actionsFor", { name: c.name })}
      items={[
        { key: "edit", label: t("competitions.edit"), icon: Pencil, onSelect: () => setDialog(c) },
        {
          key: "advance",
          label: t("competitions.advance"),
          icon: ChevronRight,
          disabled: quick.busy || c.currentMatchday >= c.matchdays,
          onSelect: () => void advance(c),
        },
        {
          key: "rollover",
          label: t("competitions.rollover.action", { season: nextSeason(c.season) }),
          icon: RefreshCcw,
          disabled: hasNextSeason(c, all),
          onSelect: () => setRolling(c),
        },
        { key: "active", label: t(c.isActive ? "competitions.close" : "competitions.reopen"), disabled: quick.busy, onSelect: () => void toggleActive(c) },
      ]}
    />
  );

  const countryOptions = admin
    ? [
        ...(countries.data ?? []).map((c) => ({ value: c.code, label: `${countryLabel(c, locale)} (${c.code})` })),
        { value: CONTINENTAL, label: t("competitions.continental") },
      ]
    : [{ value: country, label: countryName(country, locale) }];

  return (
    <AdminPage
      titleKey="competitions.title"
      subtitleKey={admin ? "competitions.subtitleAdmin" : "competitions.subtitleFederation"}
      action={
        country ? (
          <Button variant="primary" onClick={() => setDialog("new")}>
            <Plus size={16} />
            {t("competitions.new")}
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-wrap items-end gap-3">
        <SelectField
          className="w-full sm:w-72"
          label={t("admin.teams.country")}
          value={country}
          onChange={setPicked}
          disabled={!admin}
          hint={admin ? undefined : t("admin.teams.lockedCountry")}
          options={countryOptions}
        />
        <SearchBox value={q} onChange={setQ} placeholder={t("competitions.search")} label={t("common.search")} />
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "active" as const, label: t("competitions.views.active") },
            { value: "all" as const, label: t("competitions.views.all") },
          ]}
        />
      </div>

      {countries.error ? (
        <ErrorState onRetry={countries.reload} />
      ) : list.loading || (admin && countries.loading) ? (
        <ListSkeleton />
      ) : list.error ? (
        <ErrorState onRetry={list.reload} />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            title={all.length === 0 ? t("competitions.empty") : t("admin.common.noMatch")}
            hint={all.length === 0 ? t("competitions.emptyHint") : t("admin.common.noMatchHint")}
            action={
              all.length === 0 && country ? (
                <Button variant="primary" onClick={() => setDialog("new")}>
                  <Plus size={16} />
                  {t("competitions.new")}
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          <ResultsLive count={rows.length} />
          <ul className="space-y-2 lg:hidden">
            {rows.map((c) => (
              <li key={c.id}>
                <Card className="p-4 sm:p-4">
                  <div className="flex items-start gap-3">
                    <Trophy size={18} className="mt-0.5 text-gold" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-chalk">{c.name}</p>
                      <p className="text-xs text-chalk-faint">
                        {t(`finance.tiers.${c.tier}`)} · {t(`competitions.gender.${c.gender}`)} · {c.season}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <Meter value={progress(c)} tone="pitch" className="flex-1" />
                        <span className="board text-xs text-chalk">
                          {c.currentMatchday}/{c.matchdays}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {c.varEnabled && <Badge tone="var">VAR</Badge>}
                        {!c.isActive && <Badge tone="neutral">{t("competitions.inactive")}</Badge>}
                      </div>
                    </div>
                    {menu(c)}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          <Card padded={false} className="hidden lg:block">
            <div className="scroll-x">
              <table className="w-full border-collapse">
                <caption className="sr-only">{t("competitions.title")}</caption>
                <thead>
                  <tr className="border-b border-line">
                    <Th>{t("competitions.fields.name")}</Th>
                    <Th>{t("competitions.fields.tier")}</Th>
                    <Th>{t("competitions.fields.season")}</Th>
                    <Th>{t("competitions.fields.progress")}</Th>
                    <Th className="text-right">{t("competitions.fields.weight")}</Th>
                    <Th>{t("competitions.fields.status")}</Th>
                    <Th>
                      <span className="sr-only">{t("admin.common.actions")}</span>
                    </Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((c) => (
                    <tr key={c.id} className="hover:bg-red-500/[0.03]">
                      <Td>
                        <p className="max-w-72 truncate font-semibold text-chalk">{c.name}</p>
                        <p className="text-xs text-chalk-faint">
                          {[c.shortName, t(`competitions.gender.${c.gender}`)].filter(Boolean).join(" · ")}
                        </p>
                      </Td>
                      <Td>{t(`finance.tiers.${c.tier}`)}</Td>
                      <Td className="tnum">{c.season}</Td>
                      <Td>
                        <div className="flex min-w-40 items-center gap-2">
                          <Meter value={progress(c)} tone="pitch" className="flex-1" />
                          <span className="board text-xs text-chalk">
                            {c.currentMatchday}/{c.matchdays}
                          </span>
                        </div>
                      </Td>
                      <Td className="tnum text-right">{c.weight}</Td>
                      <Td>
                        <span className="flex flex-wrap gap-1.5">
                          <Badge tone={c.isActive ? "pitch" : "neutral"}>{t(c.isActive ? "competitions.active" : "competitions.inactive")}</Badge>
                          {c.varEnabled && <Badge tone="var">VAR</Badge>}
                        </span>
                      </Td>
                      <Td className="text-end">{menu(c)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {dialog && <CompetitionDialog country={country} competition={dialog === "new" ? undefined : dialog} onClose={() => setDialog(null)} onDone={changed} />}
      {rolling && <RolloverDialog competition={rolling} onCancel={() => setRolling(null)} onDone={changed} />}
    </AdminPage>
  );
}
