"use client";

import { useMemo, useState } from "react";
import { CalendarCheck, CalendarOff, History, Mail, Pencil, Phone, Send, Trophy } from "@/components/icons/glyphs";
import { Badge, Button, EmptyState } from "@/components/ui";
import { Dialog } from "@/components/admin/Dialog";
import { RowMenu, type MenuItem } from "@/components/admin/RowMenu";
import { fieldMessage, FormError, SelectField, TextField } from "@/components/admin/fields";
import { ErrorState, ListSkeleton } from "@/components/admin/states";
import { listStadiums, listTeams } from "@/lib/api/admin";
import { advanceFixture, createFixture, getConvocations, getFixtureHistory, recordResult, updateFixture, type FixturePatch } from "@/lib/api/fixtures";
import { canRecordResult, nextStep, reasonNeeded, validateFixture, type FixtureErrors, type FixtureField, type FixtureValues } from "@/lib/fixtures/workflow";
import { useAction, useResource } from "@/lib/admin/hooks";
import { describeError } from "@/lib/admin/errors";
import { useDataset } from "@/lib/dataset/DatasetProvider";
import { CAF, competitions, countries, countryName, roleKey, today, type CrewSlot, type Fixture } from "@/lib/store";
import { useFormatters, useLocale, useT, type TKey } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";

function Footer({ busy, onClose, submit, danger = false }: { busy: boolean; onClose: () => void; submit: string; danger?: boolean }) {
  const t = useT();
  return (
    <>
      <Button type="button" onClick={onClose} disabled={busy}>
        {t("common.cancel")}
      </Button>
      <Button type="submit" variant={danger ? "danger" : "primary"} disabled={busy}>
        {busy ? t("admin.common.working") : submit}
      </Button>
    </>
  );
}

/** "duplicate" and the other fixture codes get the calendar's own wording. */
const FIXTURE_CODES: Record<string, TKey> = {
  duplicate: "fixtures.errors.duplicate",
  invalid_local_time: "fixtures.errors.invalid_local_time",
  team_outside_country: "fixtures.errors.team_outside_country",
  stadium_outside_country: "fixtures.errors.stadium_outside_country",
  competition_inactive: "fixtures.errors.competition_inactive",
  crew_incomplete: "fixtures.blocked.incomplete",
  not_confirmed: "fixtures.blocked.unconfirmed",
  not_yet_played: "fixtures.errors.not_yet_played",
  no_referee: "fixtures.errors.no_referee",
  duplicate_match: "fixtures.errors.duplicate_match",
  fixture_not_scheduled: "fixtures.errors.not_scheduled",
  match_played: "live.played",
  reason_required: "fixtures.errors.reason",
  not_validated: "fixtures.errors.not_validated",
  not_published: "fixtures.errors.not_published",
  unknown_team: "fixtures.errors.unknown",
  unknown_stadium: "fixtures.errors.unknown",
  unknown_competition: "fixtures.errors.unknown",
};
const withFixtureWording = <E extends { code: string | null; key: TKey }>(e: E | null): E | null =>
  e && e.code && FIXTURE_CODES[e.code] ? { ...e, key: FIXTURE_CODES[e.code] } : e;

/* ------------------------------------------------------------ create / edit */

function TeamPicker({
  label,
  country,
  value,
  onChange,
  error,
}: {
  label: string;
  country: string;
  value: string;
  onChange: (id: string) => void;
  error?: string;
}) {
  const t = useT();
  const teams = useResource(`teams|${country}`, (signal) => listTeams(country, signal), country !== "");
  return (
    <SelectField
      label={label}
      value={value}
      onChange={onChange}
      error={error}
      disabled={!country || teams.loading}
      placeholder={teams.loading ? t("admin.common.working") : t("fixtures.chooseTeam")}
      options={(teams.data ?? []).map((tm) => ({ value: tm.id, label: tm.name }))}
      required
    />
  );
}

export function FixtureDialog({ fixture, crew, defaultCountry, onClose, onDone }: { fixture?: Fixture; crew?: CrewSlot[]; defaultCountry?: string; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const { locale } = useLocale();
  const toast = useToast();
  const { busy, error, serverFields, run } = useAction();
  const creating = !fixture;
  const [values, setValues] = useState<FixtureValues>(() => ({
    competitionId: fixture?.competitionId ?? "",
    round: String(fixture?.matchday ?? 1),
    roundLabel: fixture?.roundLabel ?? "",
    homeTeamId: fixture?.homeTeamId ?? "",
    awayTeamId: fixture?.awayTeamId ?? "",
    stadiumId: fixture?.stadiumId ?? "",
    date: fixture?.date ?? today(),
    time: fixture?.kickoff ?? "16:00",
    importance: String(fixture?.importance ?? 60),
  }));
  const [errors, setErrors] = useState<FixtureErrors>({});
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const set = (key: FixtureField, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const msg = (f: FixtureField) => fieldMessage(t, errors, serverFields, f);

  const comps = useMemo(
    () => competitions.filter((c) => c.isActive !== false && (!defaultCountry || c.countryCode === defaultCountry || c.countryCode === CAF)).sort((a, b) => a.name.localeCompare(b.name, locale)),
    [defaultCountry, locale],
  );
  const comp = competitions.find((c) => c.id === values.competitionId);
  const continental = comp?.countryCode === CAF;
  const [homeCountry, setHomeCountry] = useState(defaultCountry ?? "");
  const [awayCountry, setAwayCountry] = useState(defaultCountry ?? "");
  const domestic = comp && !continental ? comp.countryCode : "";
  const stadiumCountry = fixture ? (fixture.countryCode === CAF ? "" : fixture.countryCode) : continental ? homeCountry : domestic;
  const stadiums = useResource(`stadiums|${stadiumCountry}`, (signal) => listStadiums(stadiumCountry, signal), stadiumCountry !== "");
  const countryOptions = countries.filter((c) => c.active).map((c) => ({ value: c.code, label: countryName(c.code, locale) }));

  const rescheduled = Boolean(fixture) && (values.date !== fixture!.date || values.time !== fixture!.kickoff || (values.stadiumId || null) !== (fixture!.stadiumId ?? null));
  const needsReason = fixture && crew ? reasonNeeded(fixture, crew, { closing: false, rescheduled }) : false;

  async function submit() {
    const found = validateFixture(values, { creating });
    setErrors(found);
    const missingReason = needsReason && reason.trim().length < 3;
    setReasonError(missingReason);
    if (Object.values(found).some(Boolean) || missingReason) return;
    if (creating) {
      const res = await run(() =>
        createFixture({
          competitionId: values.competitionId,
          round: Number(values.round),
          ...(values.roundLabel.trim() ? { roundLabel: values.roundLabel.trim() } : {}),
          homeTeamId: values.homeTeamId,
          awayTeamId: values.awayTeamId,
          stadiumId: values.stadiumId || null,
          date: values.date,
          time: values.time,
          importance: Number(values.importance),
        }),
      );
      if (res.ok) {
        toast.push("success", t("fixtures.created", { home: res.value.home, away: res.value.away }));
        onDone();
      }
      return;
    }
    const f = fixture!;
    const patch: FixturePatch = {};
    if (values.date !== f.date) patch.date = values.date;
    if (values.time !== f.kickoff) patch.time = values.time;
    if (values.stadiumId && values.stadiumId !== f.stadiumId) patch.stadiumId = values.stadiumId;
    if (Number(values.round) !== f.matchday) patch.round = Number(values.round);
    if ((values.roundLabel.trim() || null) !== (f.roundLabel ?? null)) patch.roundLabel = values.roundLabel.trim() || null;
    if (Number(values.importance) !== f.importance) patch.importance = Number(values.importance);
    if (Object.keys(patch).length === 0) return onClose();
    if (needsReason) patch.reason = reason.trim();
    const res = await run(() => updateFixture(f.id, patch));
    if (res.ok) {
      const warned = res.value.warnings.length;
      toast.push(warned ? "error" : "success", warned ? t("fixtures.rescheduledWarn", { n: warned }) : t("fixtures.saved"));
      onDone();
    }
  }

  return (
    <Dialog
      size="lg"
      title={t(creating ? "fixtures.newTitle" : "fixtures.editTitle")}
      description={fixture ? `${fixture.home} — ${fixture.away}` : t("fixtures.newHint")}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      footer={<Footer busy={busy} onClose={onClose} submit={t(creating ? "fixtures.create" : "common.save")} />}
    >
      <FormError error={withFixtureWording(error)} />
      {creating && (
        <>
          <SelectField
            label={t("fixtures.fields.competition")}
            value={values.competitionId}
            onChange={(v) => {
              set("competitionId", v);
              set("homeTeamId", "");
              set("awayTeamId", "");
              set("stadiumId", "");
            }}
            options={comps.map((c) => ({ value: c.id, label: `${c.name} · ${c.season}` }))}
            placeholder={t("fixtures.chooseCompetition")}
            error={msg("competitionId")}
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              {continental && <SelectField label={t("fixtures.fields.homeCountry")} value={homeCountry} onChange={setHomeCountry} options={countryOptions} placeholder="—" />}
              <TeamPicker label={t("fixtures.fields.home")} country={continental ? homeCountry : domestic} value={values.homeTeamId} onChange={(v) => set("homeTeamId", v)} error={msg("homeTeamId")} />
            </div>
            <div className="space-y-2">
              {continental && <SelectField label={t("fixtures.fields.awayCountry")} value={awayCountry} onChange={setAwayCountry} options={countryOptions} placeholder="—" />}
              <TeamPicker label={t("fixtures.fields.away")} country={continental ? awayCountry : domestic} value={values.awayTeamId} onChange={(v) => set("awayTeamId", v)} error={msg("awayTeamId")} />
            </div>
          </div>
        </>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label={t("fixtures.fields.date")} type="date" value={values.date} onChange={(v) => set("date", v)} error={msg("date")} required />
        <TextField label={t("fixtures.fields.time")} type="time" value={values.time} onChange={(v) => set("time", v)} error={msg("time")} hint={t("fixtures.hints.localTime")} required />
        <SelectField
          label={t("fixtures.fields.stadium")}
          value={values.stadiumId}
          onChange={(v) => set("stadiumId", v)}
          disabled={!stadiumCountry || stadiums.loading}
          placeholder={t("fixtures.noStadium")}
          options={(stadiums.data ?? []).map((s) => ({ value: s.id, label: s.city ? `${s.name} · ${s.city}` : s.name }))}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label={t("fixtures.fields.round")} inputMode="numeric" value={values.round} onChange={(v) => set("round", v)} error={msg("round")} maxLength={3} required />
        <TextField label={t("fixtures.fields.roundLabel")} value={values.roundLabel} onChange={(v) => set("roundLabel", v)} error={msg("roundLabel")} placeholder={t("fixtures.hints.roundLabel")} maxLength={60} />
        <TextField
          label={t("fixtures.fields.importance")}
          inputMode="numeric"
          value={values.importance}
          onChange={(v) => set("importance", v)}
          error={msg("importance")}
          hint={t("fixtures.hints.importance")}
          maxLength={3}
        />
      </div>
      {needsReason && (
        <TextField
          label={t("fixtures.fields.reason")}
          value={reason}
          onChange={(v) => {
            setReason(v);
            setReasonError(false);
          }}
          error={reasonError ? t("fixtures.errors.reason") : undefined}
          hint={t("fixtures.hints.reason")}
          maxLength={300}
          required
        />
      )}
    </Dialog>
  );
}

/* ------------------------------------------------------- postpone / cancel */

export function StatusDialog({ fixture, crew, to, onClose, onDone }: { fixture: Fixture; crew: CrewSlot[]; to: "postponed" | "cancelled" | "scheduled"; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const { busy, error, run } = useAction();
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const needs = to !== "scheduled" && reasonNeeded(fixture, crew, { closing: true, rescheduled: false });

  async function submit() {
    if (needs && reason.trim().length < 3) return setReasonError(true);
    const res = await run(() => updateFixture(fixture.id, { status: to, ...(reason.trim() ? { reason: reason.trim() } : {}) }));
    if (res.ok) {
      toast.push("success", t(`fixtures.status.done.${to}`));
      onDone();
    }
  }

  return (
    <Dialog
      size="sm"
      title={t(`fixtures.status.title.${to}`)}
      description={`${fixture.home} — ${fixture.away}`}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      footer={<Footer busy={busy} onClose={onClose} submit={t(`fixtures.status.confirm.${to}`)} danger={to === "cancelled"} />}
    >
      <FormError error={withFixtureWording(error)} />
      <p className="text-sm text-chalk-dim">{t(`fixtures.status.body.${to}`)}</p>
      <TextField
        label={t("fixtures.fields.reason")}
        value={reason}
        onChange={(v) => {
          setReason(v);
          setReasonError(false);
        }}
        error={reasonError ? t("fixtures.errors.reason") : undefined}
        hint={needs ? t("fixtures.hints.reasonNotified") : undefined}
        required={needs}
        maxLength={300}
      />
    </Dialog>
  );
}

/* ------------------------------------------------------------------ result */

export function ResultDialog({ fixture, onClose, onDone }: { fixture: Fixture; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const { busy, error, run } = useAction();
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [attendance, setAttendance] = useState("");
  const [bad, setBad] = useState<"score" | "attendance" | null>(null);

  async function submit() {
    const score = /^\d{1,2}$/.test(home.trim()) && /^\d{1,2}$/.test(away.trim());
    const crowd = attendance.trim() === "" || (/^\d{1,6}$/.test(attendance.trim()) && Number(attendance) <= 300_000);
    setBad(!score ? "score" : !crowd ? "attendance" : null);
    if (!score || !crowd) return;
    const res = await run(() =>
      recordResult(fixture.id, { homeScore: Number(home), awayScore: Number(away), ...(attendance.trim() ? { attendance: Number(attendance) } : {}) }),
    );
    if (res.ok) {
      toast.push("success", t("fixtures.result.done", { home: fixture.home, score: `${home}-${away}`, away: fixture.away }));
      onDone();
    }
  }

  return (
    <Dialog
      size="sm"
      title={t("fixtures.result.title")}
      description={`${fixture.home} — ${fixture.away}`}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      footer={<Footer busy={busy} onClose={onClose} submit={t("fixtures.result.submit")} />}
    >
      <FormError error={withFixtureWording(error)} />
      <div className="grid grid-cols-2 gap-4">
        <TextField label={fixture.home} inputMode="numeric" value={home} onChange={setHome} maxLength={2} required error={bad === "score" ? t("fixtures.errors.score") : undefined} />
        <TextField label={fixture.away} inputMode="numeric" value={away} onChange={setAway} maxLength={2} required />
      </div>
      <TextField
        label={t("fixtures.result.attendance")}
        inputMode="numeric"
        value={attendance}
        onChange={setAttendance}
        maxLength={6}
        error={bad === "attendance" ? t("fixtures.errors.attendance") : undefined}
      />
      <p className="text-xs text-chalk-faint">{t("fixtures.result.hint")}</p>
    </Dialog>
  );
}

/* ------------------------------------------------------------ convocations */

export function ConvocationsDialog({ fixture, onClose }: { fixture: Fixture; onClose: () => void }) {
  const t = useT();
  const { locale } = useLocale();
  const list = useResource(`convocations|${fixture.id}`, (signal) => getConvocations(fixture.id, signal));
  const emails = (list.data ?? []).map((c) => c.official?.email).filter((e): e is string => Boolean(e));
  return (
    <Dialog size="md" title={t("fixtures.convocations.title")} description={`${fixture.home} — ${fixture.away} · ${fixture.date} ${fixture.kickoff}`} onClose={onClose}>
      {list.loading ? (
        <ListSkeleton rows={4} />
      ) : list.error ? (
        <ErrorState onRetry={list.reload} />
      ) : (
        <>
          <ul className="space-y-2">
            {(list.data ?? []).map((c) => (
              <li key={c.role} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-line bg-ink-1 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-chalk">{c.official?.name ?? "—"}</p>
                  <p className="text-[11px] text-chalk-faint">{locale === "fr" ? c.roleLabel.fr : c.roleLabel.en}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {c.official?.email && (
                    <a href={`mailto:${c.official.email}`} className="inline-flex items-center gap-1 text-chalk-dim hover:text-chalk">
                      <Mail size={12} />
                      {c.official.email}
                    </a>
                  )}
                  {c.official?.phone && (
                    <a href={`tel:${c.official.phone.replace(/\s+/g, "")}`} className="inline-flex items-center gap-1 text-chalk-dim hover:text-chalk">
                      <Phone size={12} />
                      {c.official.phone}
                    </a>
                  )}
                  <Badge tone={c.state === "confirmed" ? "pitch" : "amber"}>{t(c.state === "confirmed" ? "common.confirmed" : "common.pending")}</Badge>
                </div>
              </li>
            ))}
          </ul>
          {emails.length > 0 && (
            <a
              href={`mailto:${emails.join(",")}?subject=${encodeURIComponent(`${fixture.home} — ${fixture.away} · ${fixture.date}`)}`}
              className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs text-chalk-dim hover:text-chalk"
            >
              <Mail size={13} />
              {t("fixtures.convocations.emailAll", { n: emails.length })}
            </a>
          )}
        </>
      )}
    </Dialog>
  );
}

/* ----------------------------------------------------------------- history */

const HISTORY_ACTIONS = ["assign", "clear", "confirm", "accept", "decline", "replace", "autofill", "validate", "publish", "revert"];
const EVENT_KEYS: Record<string, TKey> = {
  "fixture.create": "fixtures.history.events.create",
  "fixture.update": "fixtures.history.events.update",
  "fixture.postponed": "fixtures.history.events.postponed",
  "fixture.cancelled": "fixtures.history.events.cancelled",
  "fixture.submit": "fixtures.history.events.submit",
  "fixture.validate": "fixtures.history.events.validate",
  "fixture.publish": "fixtures.history.events.publish",
  "fixture.result": "fixtures.history.events.result",
  "payment.generate": "fixtures.history.events.billed",
};

export function HistoryDialog({ fixture, onClose }: { fixture: Fixture; onClose: () => void }) {
  const t = useT();
  const fmt = useFormatters();
  const data = useResource(`history|${fixture.id}`, (signal) => getFixtureHistory(fixture.id, signal));
  const rows = useMemo(() => {
    if (!data.data) return [];
    const crew = data.data.history.map((h) => ({
      key: `h${h.id}`,
      at: h.at,
      who: h.actorKind === "engine" ? t("fixtures.history.engine") : (h.actorName ?? "—"),
      what: `${h.role in roleKey ? t(roleKey[h.role]) : h.role} · ${HISTORY_ACTIONS.includes(h.action) ? t(`fixtures.history.actions.${h.action}` as TKey) : h.action}${h.toName ? ` → ${h.toName}` : h.fromName ? ` (${h.fromName})` : ""}`,
      reason: h.reason,
    }));
    const events = data.data.events.map((e) => ({ key: `e${e.id}`, at: e.at, who: e.actorName ?? "—", what: EVENT_KEYS[e.action] ? t(EVENT_KEYS[e.action]) : e.action, reason: e.reason }));
    return [...crew, ...events].sort((a, b) => b.at.localeCompare(a.at));
  }, [data.data, t]);

  return (
    <Dialog size="md" title={t("fixtures.history.title")} description={`${fixture.home} — ${fixture.away}`} onClose={onClose}>
      {data.loading ? (
        <ListSkeleton rows={5} />
      ) : data.error ? (
        <ErrorState onRetry={data.reload} />
      ) : rows.length === 0 ? (
        <EmptyState title={t("fixtures.history.empty")} />
      ) : (
        <ol className="relative space-y-3 border-s border-line ps-4">
          {rows.map((r) => (
            <li key={r.key} className="relative">
              <span className="absolute -start-[21px] top-1.5 h-2 w-2 rounded-full bg-var" />
              <p className="text-sm text-chalk">{r.what}</p>
              <p className="text-[11px] text-chalk-faint">
                {fmt.date(r.at.slice(0, 10))} {r.at.slice(11, 16)} · {r.who}
              </p>
              {r.reason && <p className="mt-0.5 text-xs italic text-chalk-dim">“{r.reason}”</p>}
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  );
}

/* ------------------------------------------------------------ per fixture */

type Open = "edit" | "postponed" | "cancelled" | "scheduled" | "result" | "convocations" | "history" | null;

/**
 * Everything the federation does to one fixture besides designating: the pipeline step, rescheduling,
 * postponing or cancelling, the result, the convocations, the history.
 */
export function FixtureActions({ fixture, crew, onChanged }: { fixture: Fixture; crew: CrewSlot[]; onChanged: () => void }) {
  const t = useT();
  const toast = useToast();
  const { noteFailure } = useDataset();
  const step = nextStep(fixture, crew);
  const [advancing, setAdvancing] = useState(false);
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);
  const done = () => {
    setOpen(null);
    onChanged();
  };

  async function take() {
    const action = step.step;
    if (!action) return;
    setAdvancing(true);
    try {
      await advanceFixture(fixture.id, action);
      toast.push("success", t(`fixtures.steps.done.${action}`));
      onChanged();
    } catch (err) {
      noteFailure(err);
      toast.push("error", t(withFixtureWording(describeError(err))!.key));
    } finally {
      setAdvancing(false);
    }
  }

  const scheduled = fixture.status === "scheduled" && !fixture.played;
  const items: MenuItem[] = [
    ...(scheduled ? [{ key: "edit", label: t("fixtures.menu.edit"), icon: Pencil, onSelect: () => setOpen("edit") }] : []),
    ...(canRecordResult(fixture, crew, new Date()) ? [{ key: "result", label: t("fixtures.menu.result"), icon: Trophy, onSelect: () => setOpen("result") }] : []),
    ...(fixture.designationStatus === "published" ? [{ key: "conv", label: t("fixtures.menu.convocations"), icon: Send, onSelect: () => setOpen("convocations") }] : []),
    ...(scheduled
      ? [
          { key: "postpone", label: t("fixtures.menu.postpone"), icon: CalendarOff, onSelect: () => setOpen("postponed") },
          { key: "cancel", label: t("fixtures.menu.cancel"), icon: CalendarOff, danger: true, onSelect: () => setOpen("cancelled") },
        ]
      : []),
    ...(!fixture.played && fixture.status !== "scheduled" ? [{ key: "reinstate", label: t("fixtures.menu.reinstate"), icon: CalendarCheck, onSelect: () => setOpen("scheduled") }] : []),
    { key: "history", label: t("fixtures.menu.history"), icon: History, onSelect: () => setOpen("history") },
  ];

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {step.step && (
        <Button
          size="sm"
          variant={step.blocked ? "ghost" : "primary"}
          disabled={advancing || Boolean(step.blocked)}
          title={step.blocked ? t(step.blocked) : undefined}
          onClick={() => void take()}
        >
          {t(`fixtures.steps.${step.step}`)}
        </Button>
      )}
      <RowMenu label={t("fixtures.menu.label", { home: fixture.home, away: fixture.away })} items={items} />
      {open === "edit" && <FixtureDialog fixture={fixture} crew={crew} onClose={close} onDone={done} />}
      {(open === "postponed" || open === "cancelled" || open === "scheduled") && <StatusDialog fixture={fixture} crew={crew} to={open} onClose={close} onDone={done} />}
      {open === "result" && <ResultDialog fixture={fixture} onClose={close} onDone={done} />}
      {open === "convocations" && <ConvocationsDialog fixture={fixture} onClose={close} />}
      {open === "history" && <HistoryDialog fixture={fixture} onClose={close} />}
    </div>
  );
}
