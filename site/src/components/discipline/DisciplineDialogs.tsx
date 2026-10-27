"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarDays, Gauge, ShieldAlert } from "@/components/icons/glyphs";
import { Badge, Button } from "@/components/ui";
import { Dialog } from "@/components/admin/Dialog";
import { FormError, SelectField, TextAreaField, TextField } from "@/components/admin/fields";
import { OfficialPicker } from "@/components/admin/OfficialPicker";
import { listCountries } from "@/lib/api/admin";
import {
  appealCase,
  closeCase,
  decideCase,
  INCIDENT_KINDS,
  INCIDENT_STATUSES,
  openCase,
  reportIncident,
  SANCTIONS,
  scheduleHearing,
  SEVERITIES,
  updateIncident,
  type AffectedDesignation,
  type DisciplinaryCase,
  type Incident,
  type IncidentKind,
  type IncidentStatus,
  type Sanction,
  type Severity,
} from "@/lib/api/discipline";
import { isAdmin } from "@/lib/admin/actor";
import { useAction, useActor, useResource } from "@/lib/admin/hooks";
import { caseActions, CASE_TONE, closingLiftsSuspension, SANCTION_TONE, validateDecision, type CaseAction, type DecisionDraft } from "@/lib/discipline/rules";
import { refereeHref, today } from "@/lib/store";
import { useFormatters, useT } from "@/lib/i18n/LocaleProvider";
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

function usePicker() {
  const actor = useActor();
  const admin = isAdmin(actor);
  const countries = useResource("countries|active", (signal) => listCountries(false, signal), admin);
  return { country: admin ? undefined : (actor?.country ?? undefined), countries: countries.data };
}

const justifiedValue = (v: number | null) => (v === null ? "" : v ? "yes" : "no");

/* ------------------------------------------------------------- incidents */

export function ReportDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const picker = usePicker();
  const { busy, error, run } = useAction();
  const [officialId, setOfficialId] = useState("");
  const [kind, setKind] = useState<IncidentKind>("absence");
  const [severity, setSeverity] = useState<Severity>("minor");
  const [justified, setJustified] = useState("");
  const [description, setDescription] = useState("");
  const [tried, setTried] = useState(false);
  const descBad = description.trim().length < 5;

  async function submit() {
    setTried(true);
    if (!officialId || descBad) return;
    const res = await run(() =>
      reportIncident({ officialId, kind, severity, description: description.trim(), ...(justified ? { justified: justified === "yes" } : {}) }),
    );
    if (res.ok) {
      toast.push("success", t("discipline.incident.saved"));
      onDone();
    }
  }

  return (
    <Dialog size="lg" title={t("discipline.report.title")} description={t("discipline.report.hint")} onClose={onClose} onSubmit={() => void submit()} busy={busy} footer={<Footer busy={busy} onClose={onClose} submit={t("discipline.report.submit")} />}>
      <div className="space-y-4">
        <OfficialPicker value={officialId} onChange={setOfficialId} country={picker.country} countries={picker.countries} error={tried && !officialId ? t("admin.errors.pickOfficial") : undefined} />
        <div className="grid gap-3 sm:grid-cols-3">
          <SelectField label={t("discipline.fields.kind")} value={kind} onChange={(v) => setKind(v as IncidentKind)} options={INCIDENT_KINDS.map((k) => ({ value: k, label: t(`discipline.kinds.${k}`) }))} />
          <SelectField label={t("discipline.severity.label")} value={severity} onChange={(v) => setSeverity(v as Severity)} options={SEVERITIES.map((s) => ({ value: s, label: t(`discipline.severity.${s}`) }))} />
          <SelectField
            label={t("discipline.justified.label")}
            value={justified}
            onChange={setJustified}
            placeholder={t("discipline.justified.unknown")}
            options={[
              { value: "yes", label: t("discipline.justified.yes") },
              { value: "no", label: t("discipline.justified.no") },
            ]}
          />
        </div>
        <TextAreaField label={t("discipline.fields.description")} value={description} onChange={setDescription} required rows={4} maxLength={2000} error={tried && descBad ? t("discipline.errors.description") : undefined} />
        <FormError error={error} />
      </div>
    </Dialog>
  );
}

/** One report: review it (status, severity, justified) or turn it into a procedure. */
export function IncidentDialog({ incident, onClose, onDone, onOpenCase }: { incident: Incident; onClose: () => void; onDone: () => void; onOpenCase: (i: Incident) => void }) {
  const t = useT();
  const fmt = useFormatters();
  const toast = useToast();
  const { busy, error, run } = useAction();
  const [status, setStatus] = useState<IncidentStatus>(incident.status);
  const [severity, setSeverity] = useState<Severity>(incident.severity);
  const [justified, setJustified] = useState(justifiedValue(incident.justified));

  async function submit() {
    const body = {
      ...(status !== incident.status ? { status } : {}),
      ...(severity !== incident.severity ? { severity } : {}),
      ...(justified && justified !== justifiedValue(incident.justified) ? { justified: justified === "yes" } : {}),
    };
    if (Object.keys(body).length === 0) return onClose();
    const res = await run(() => updateIncident(incident.id, body));
    if (res.ok) {
      toast.push("success", t("discipline.incident.saved"));
      onDone();
    }
  }

  return (
    <Dialog
      size="lg"
      title={`${t(`discipline.kinds.${incident.kind}`)} · ${incident.officialName}`}
      description={`${t("discipline.fields.reportedAt")} ${fmt.longDate(incident.reportedAt.slice(0, 10))}`}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      footer={
        <>
          <Button type="button" onClick={() => onOpenCase(incident)} disabled={busy}>
            <ShieldAlert size={15} />
            {t("discipline.incident.openCase")}
          </Button>
          <Footer busy={busy} onClose={onClose} submit={t("discipline.incident.save")} />
        </>
      }
    >
      <div className="space-y-4">
        <p className="whitespace-pre-line rounded-lg border border-line bg-ink-1 px-3 py-2.5 text-sm text-chalk">{incident.description}</p>
        <Link href={refereeHref(incident.officialId)} className="inline-block text-sm text-red-600 underline-offset-2 hover:underline dark:text-red-400">
          {incident.officialName}
        </Link>
        <div className="grid gap-3 sm:grid-cols-3">
          <SelectField label={t("discipline.fields.status")} value={status} onChange={(v) => setStatus(v as IncidentStatus)} options={INCIDENT_STATUSES.map((s) => ({ value: s, label: t(`discipline.incidentStatus.${s}`) }))} />
          <SelectField label={t("discipline.severity.label")} value={severity} onChange={(v) => setSeverity(v as Severity)} options={SEVERITIES.map((s) => ({ value: s, label: t(`discipline.severity.${s}`) }))} />
          <SelectField
            label={t("discipline.justified.label")}
            value={justified}
            onChange={setJustified}
            placeholder={t("discipline.justified.unknown")}
            options={[
              { value: "yes", label: t("discipline.justified.yes") },
              { value: "no", label: t("discipline.justified.no") },
            ]}
          />
        </div>
        <FormError error={error} />
      </div>
    </Dialog>
  );
}

/* ----------------------------------------------------------------- cases */

export function OpenCaseDialog({ incident, onClose, onDone }: { incident?: Incident; onClose: () => void; onDone: (c: DisciplinaryCase) => void }) {
  const t = useT();
  const toast = useToast();
  const picker = usePicker();
  const { busy, error, run } = useAction();
  const [officialId, setOfficialId] = useState(incident?.officialId ?? "");
  const [summary, setSummary] = useState(incident ? `${t(`discipline.kinds.${incident.kind}`)} — ${incident.description}`.slice(0, 2000) : "");
  const [tried, setTried] = useState(false);
  const summaryBad = summary.trim().length < 5;

  async function submit() {
    setTried(true);
    if (!officialId || summaryBad) return;
    const res = await run(() => openCase({ officialId, summary: summary.trim(), ...(incident ? { incidentId: incident.id } : {}) }));
    if (res.ok) {
      toast.push("success", t("discipline.open.done"));
      onDone(res.value);
    }
  }

  return (
    <Dialog size="lg" title={t("discipline.open.title")} description={t("discipline.open.hint")} onClose={onClose} onSubmit={() => void submit()} busy={busy} footer={<Footer busy={busy} onClose={onClose} submit={t("discipline.open.submit")} />}>
      <div className="space-y-4">
        {incident ? (
          <p className="text-sm font-semibold text-chalk">{incident.officialName}</p>
        ) : (
          <OfficialPicker value={officialId} onChange={setOfficialId} country={picker.country} countries={picker.countries} error={tried && !officialId ? t("admin.errors.pickOfficial") : undefined} />
        )}
        <TextAreaField label={t("discipline.fields.summary")} value={summary} onChange={setSummary} required rows={4} maxLength={2000} error={tried && summaryBad ? t("discipline.errors.description") : undefined} />
        <FormError error={error} />
      </div>
    </Dialog>
  );
}

/** One procedure: its history, and the step that comes next. */
export function CaseDialog({ kase, onClose, onAction }: { kase: DisciplinaryCase; onClose: () => void; onAction: (a: CaseAction, c: DisciplinaryCase) => void }) {
  const t = useT();
  const fmt = useFormatters();
  const actions = caseActions(kase.status);
  const when = (ts: string | null) => (ts ? fmt.longDate(ts.slice(0, 10)) : "—");

  return (
    <Dialog size="lg" title={kase.officialName} description={`${t("discipline.fields.openedAt")} ${when(kase.openedAt)}`} onClose={onClose}>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <Badge tone={CASE_TONE[kase.status]}>{t(`discipline.caseStatus.${kase.status}`)}</Badge>
          {kase.sanction && <Badge tone={SANCTION_TONE[kase.sanction]}>{t(`discipline.sanctions.${kase.sanction}`)}</Badge>}
          <Link href={refereeHref(kase.officialId)} className="text-sm text-red-600 underline-offset-2 hover:underline dark:text-red-400">
            {t("common.seeProfile")}
          </Link>
        </div>

        {actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {actions.includes("hearing") && (
              <Button onClick={() => onAction("hearing", kase)}>
                <CalendarDays size={15} />
                {t("discipline.hearing.button")}
              </Button>
            )}
            {actions.includes("decide") && (
              <Button variant="primary" onClick={() => onAction("decide", kase)}>
                <Gauge size={15} />
                {kase.status === "appealed" ? t("discipline.decide.onAppeal") : t("discipline.decide.button")}
              </Button>
            )}
            {actions.includes("appeal") && <Button onClick={() => onAction("appeal", kase)}>{t("discipline.appeal.button")}</Button>}
            {actions.includes("close") && (
              <Button variant="danger" onClick={() => onAction("close", kase)}>
                {t("discipline.close.button")}
              </Button>
            )}
          </div>
        )}

        <section aria-labelledby="case-summary">
          <h3 id="case-summary" className="mb-1 text-xs font-semibold text-chalk-faint">
            {t("discipline.fields.summary")}
          </h3>
          <p className="whitespace-pre-line text-sm text-chalk">{kase.summary}</p>
        </section>

        <section aria-labelledby="case-timeline">
          <h3 id="case-timeline" className="mb-3 text-sm font-semibold text-chalk">
            {t("discipline.timeline.title")}
          </h3>
          <ol className="relative space-y-4 border-s border-line ps-5 text-sm">
            <Step date={when(kase.openedAt)} text={t("discipline.timeline.opened")} />
            {kase.hearingAt && <Step date="" text={t("discipline.timeline.hearing", { date: fmt.longDate(kase.hearingAt.slice(0, 10)) + (kase.hearingAt.length > 10 ? ` ${kase.hearingAt.slice(11, 16)}` : "") })} />}
            {kase.decidedAt && kase.sanction && (
              <Step date={when(kase.decidedAt)} text={t("discipline.timeline.decided", { sanction: t(`discipline.sanctions.${kase.sanction}`) })}>
                {kase.decision && <p className="mt-1 whitespace-pre-line text-chalk-dim">{kase.decision}</p>}
                {kase.decisionRef && <p className="mt-1 text-xs text-chalk-faint">{kase.decisionRef}</p>}
                {kase.suspensionFrom && kase.suspensionTo && (
                  <p className="mt-1 text-xs font-semibold text-card-red">{t("discipline.timeline.window", { from: fmt.date(kase.suspensionFrom), to: fmt.date(kase.suspensionTo) })}</p>
                )}
              </Step>
            )}
            {kase.appealNote && (
              <Step date="" text={t("discipline.timeline.appealed")}>
                <p className="mt-1 whitespace-pre-line text-chalk-dim">{kase.appealNote}</p>
              </Step>
            )}
            {kase.status === "closed" && <Step date="" text={t("discipline.timeline.closed")} />}
          </ol>
        </section>
      </div>
    </Dialog>
  );
}

function Step({ date, text, children }: { date: string; text: string; children?: React.ReactNode }) {
  return (
    <li className="relative">
      <span aria-hidden className="absolute -start-[1.6rem] top-1 h-2.5 w-2.5 rounded-full border border-line-strong bg-ink-3" />
      {date && <p className="text-xs text-chalk-faint">{date}</p>}
      <p className="font-medium text-chalk">{text}</p>
      {children}
    </li>
  );
}

export function HearingDialog({ kase, onClose, onDone }: { kase: DisciplinaryCase; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const { busy, error, run } = useAction();
  const [at, setAt] = useState(kase.hearingAt ? kase.hearingAt.slice(0, 16) : `${today()}T10:00`);
  const [tried, setTried] = useState(false);
  const bad = !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(at);

  async function submit() {
    setTried(true);
    if (bad) return;
    const res = await run(() => scheduleHearing(kase.id, at));
    if (res.ok) {
      toast.push("success", t("discipline.hearing.done"));
      onDone();
    }
  }

  return (
    <Dialog size="sm" title={t("discipline.hearing.title")} description={t("discipline.hearing.hint")} onClose={onClose} onSubmit={() => void submit()} busy={busy} footer={<Footer busy={busy} onClose={onClose} submit={t("discipline.hearing.submit")} />}>
      <div className="space-y-4">
        <TextField type="datetime-local" label={t("discipline.hearing.at")} value={at} onChange={setAt} required error={tried && bad ? t("discipline.errors.hearing") : undefined} />
        <FormError error={error} />
      </div>
    </Dialog>
  );
}

export function DecideDialog({ kase, onClose, onDone }: { kase: DisciplinaryCase; onClose: () => void; onDone: (affected: AffectedDesignation[]) => void }) {
  const t = useT();
  const toast = useToast();
  const { busy, error, run } = useAction();
  const [d, setD] = useState<DecisionDraft>({
    sanction: kase.sanction ?? "warning",
    decision: "",
    decisionRef: kase.decisionRef ?? "",
    from: kase.suspensionFrom ?? today(),
    to: kase.suspensionTo ?? "",
  });
  const [tried, setTried] = useState(false);
  const problems = validateDecision(d);
  const set = <K extends keyof DecisionDraft>(k: K, v: DecisionDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  async function submit() {
    setTried(true);
    if (Object.keys(problems).length) return;
    const res = await run(() =>
      decideCase(kase.id, {
        sanction: d.sanction,
        decision: d.decision.trim(),
        ...(d.decisionRef.trim() ? { decisionRef: d.decisionRef.trim() } : {}),
        ...(d.sanction === "suspension" ? { suspensionFrom: d.from, suspensionTo: d.to } : {}),
      }),
    );
    if (res.ok) {
      toast.push("success", t("discipline.decide.done"));
      onDone(d.sanction === "suspension" || d.sanction === "removal" ? res.value.affectedDesignations : []);
    }
  }

  return (
    <Dialog
      size="lg"
      title={kase.status === "appealed" ? t("discipline.decide.onAppeal") : t("discipline.decide.title")}
      description={t("discipline.decide.hint")}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      footer={<Footer busy={busy} onClose={onClose} submit={t("discipline.decide.submit")} danger={d.sanction === "removal"} />}
    >
      <div className="space-y-4">
        <SelectField label={t("discipline.fields.sanction")} value={d.sanction} onChange={(v) => set("sanction", v as Sanction)} options={SANCTIONS.map((s) => ({ value: s, label: t(`discipline.sanctions.${s}`) }))} className="sm:w-72" />
        {d.sanction === "removal" && (
          <p role="alert" className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-chalk">
            <AlertTriangle size={15} className="shrink-0 text-card-red" />
            {t("discipline.decide.removalWarning")}
          </p>
        )}
        <TextAreaField label={t("discipline.fields.decision")} value={d.decision} onChange={(v) => set("decision", v)} required rows={4} maxLength={2000} error={tried && problems.decision ? t("discipline.errors.decision") : undefined} />
        <TextField
          label={t("discipline.fields.decisionRef")}
          value={d.decisionRef}
          onChange={(v) => set("decisionRef", v)}
          required={d.sanction === "suspension"}
          maxLength={80}
          hint={t("discipline.decide.refHint")}
          error={tried && problems.decisionRef ? t("discipline.errors.ref") : undefined}
        />
        {d.sanction === "suspension" && (
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-1 text-xs font-semibold text-chalk-faint">{t("discipline.fields.window")}</legend>
            <TextField type="date" label={t("discipline.decide.from")} value={d.from} onChange={(v) => set("from", v)} required />
            <TextField type="date" label={t("discipline.decide.to")} value={d.to} min={d.from} onChange={(v) => set("to", v)} required error={tried && problems.window ? t("discipline.errors.window") : undefined} />
          </fieldset>
        )}
        <FormError error={error} />
      </div>
    </Dialog>
  );
}

export function AppealDialog({ kase, onClose, onDone }: { kase: DisciplinaryCase; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const { busy, error, run } = useAction();
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const bad = note.trim().length < 5;

  async function submit() {
    setTried(true);
    if (bad) return;
    const res = await run(() => appealCase(kase.id, note.trim()));
    if (res.ok) {
      toast.push("success", t("discipline.appeal.done"));
      onDone();
    }
  }

  return (
    <Dialog title={t("discipline.appeal.title")} description={t("discipline.appeal.hint")} onClose={onClose} onSubmit={() => void submit()} busy={busy} footer={<Footer busy={busy} onClose={onClose} submit={t("discipline.appeal.submit")} />}>
      <div className="space-y-4">
        <TextAreaField label={t("discipline.appeal.note")} value={note} onChange={setNote} required rows={4} maxLength={2000} error={tried && bad ? t("discipline.errors.description") : undefined} />
        <FormError error={error} />
      </div>
    </Dialog>
  );
}

export function CloseDialog({ kase, onClose, onDone }: { kase: DisciplinaryCase; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const { busy, error, run } = useAction();
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const bad = note.trim().length < 3;
  const lifts = closingLiftsSuspension(kase, today());

  async function submit() {
    setTried(true);
    if (bad) return;
    const res = await run(() => closeCase(kase.id, note.trim()));
    if (res.ok) {
      toast.push("success", t("discipline.close.done"));
      onDone();
    }
  }

  return (
    <Dialog size="sm" title={t("discipline.close.title")} description={t("discipline.close.hint")} onClose={onClose} onSubmit={() => void submit()} busy={busy} footer={<Footer busy={busy} onClose={onClose} submit={t("discipline.close.submit")} danger />}>
      <div className="space-y-4">
        {lifts && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-chalk">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber" />
            {t("discipline.close.liftWarning")}
          </p>
        )}
        <TextAreaField label={t("discipline.close.note")} value={note} onChange={setNote} required maxLength={1000} error={tried && bad ? t("finance.errors.short") : undefined} />
        <FormError error={error} />
      </div>
    </Dialog>
  );
}
