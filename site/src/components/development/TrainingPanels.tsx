"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BadgeCheck, GraduationCap, Pencil, Plus, UserPlus, X } from "@/components/icons/glyphs";
import { Badge, Button, Card, CardHeader, EmptyState, Td, Th } from "@/components/ui";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { Dialog } from "@/components/admin/Dialog";
import { FormError, SelectField, TextField } from "@/components/admin/fields";
import { OfficialPicker } from "@/components/admin/OfficialPicker";
import { ErrorState, ListSkeleton } from "@/components/admin/states";
import { SearchBox } from "@/components/admin/Toolbar";
import { listCountries, listFederations } from "@/lib/api/admin";
import {
  addLicence,
  completeOfficials,
  createCourse,
  enrolOfficials,
  LICENCE_KINDS,
  listCourses,
  listLicences,
  recordFitness,
  updateLicence,
  type CourseKind,
  type CourseRow,
  type LicenceKind,
  type LicenceRow,
} from "@/lib/api/training";
import { isAdmin } from "@/lib/admin/actor";
import { useAction, useActor, useResource } from "@/lib/admin/hooks";
import { pickLocalized } from "@/lib/i18n/localized";
import { addDays, officialById, refereeHref, today, type FitnessTest } from "@/lib/store";
import { useScope } from "@/lib/scope/ScopeProvider";
import { useDataset } from "@/lib/dataset/DatasetProvider";
import { useFormatters, useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

function Footer({ busy, onClose, submit }: { busy: boolean; onClose: () => void; submit: string }) {
  const t = useT();
  return (
    <>
      <Button type="button" onClick={onClose} disabled={busy}>
        {t("common.cancel")}
      </Button>
      <Button type="submit" variant="primary" disabled={busy}>
        {busy ? t("admin.common.working") : submit}
      </Button>
    </>
  );
}

/** The picker needs the country list only for an administrator, who may pick any country's official. */
function usePickerCountries() {
  const actor = useActor();
  const admin = isAdmin(actor);
  const countries = useResource("countries|active", (signal) => listCountries(false, signal), admin);
  return { country: admin ? undefined : (actor?.country ?? undefined), countries: countries.data };
}

/* -------------------------------------------------------------- licences */

export function LicencesPanel() {
  const t = useT();
  const fmt = useFormatters();
  const toast = useToast();
  const { refresh } = useDataset();
  const { scope, matches, lockedTo } = useScope();
  const country = lockedTo ?? (scope.kind === "country" ? scope.code : undefined);
  const [tick, setTick] = useState(0);
  const list = useResource(`licences|${country ?? ""}|${tick}`, (signal) => listLicences({ country }, signal));
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<LicenceRow | "new" | null>(null);
  const renew = useAction();

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (list.data ?? [])
      .filter((l) => matches(l.countryCode))
      .filter((l) => !needle || l.officialName.toLowerCase().includes(needle) || l.kind.toLowerCase().includes(needle));
  }, [list.data, matches, q]);

  const changed = () => {
    setEditing(null);
    setTick((n) => n + 1);
    void refresh();
  };

  async function renewFor(l: LicenceRow) {
    const issued = today();
    const res = await renew.run(() => updateLicence(l.id, { issued, expires: addDays(issued, 365) }));
    if (res.ok) {
      toast.push("success", t("development.renewed"));
      changed();
    } else toast.push("error", t("admin.errors.generic"));
  }

  return (
    <Card padded={false}>
      <div className="px-4 py-3">
        <CardHeader
          icon={BadgeCheck}
          tint="var"
          title={t("development.licences")}
          subtitle={t("development.varNote")}
          className="mb-0"
          action={
            <Button variant="primary" size="sm" onClick={() => setEditing("new")}>
              <Plus size={14} />
              {t("development.addLicence")}
            </Button>
          }
        />
        <div className="mt-3">
          <SearchBox value={q} onChange={setQ} placeholder={t("development.searchLicences")} />
        </div>
      </div>
      <div className="chalk-rule" />
      {list.loading ? (
        <div className="p-4">
          <ListSkeleton rows={5} />
        </div>
      ) : list.error ? (
        <div className="p-4">
          <ErrorState onRetry={list.reload} />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-4">
          <EmptyState title={t("development.noLicences")} />
        </div>
      ) : (
        <div className="scroll-x">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-line">
                <Th>{t("common.official")}</Th>
                <Th>{t("development.licences")}</Th>
                <Th>{t("development.issued")}</Th>
                <Th>{t("development.expires")}</Th>
                <Th>{t("common.status")}</Th>
                <Th className="text-right">
                  <span className="sr-only">{t("admin.common.actions")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => {
                const days = Math.round((Date.parse(`${l.expires}T12:00:00Z`) - Date.parse(`${today()}T12:00:00Z`)) / 86_400_000);
                return (
                  <tr key={l.id} className="row-hover border-b border-line last:border-0">
                    <Td>
                      <Link href={refereeHref(l.officialId)} className="text-chalk hover:underline">
                        <CountryFlag code={l.countryCode} /> {l.officialName}
                      </Link>
                    </Td>
                    <Td>{l.kind}</Td>
                    <Td className="tnum">{fmt.date(l.issued)}</Td>
                    <Td className="tnum">{fmt.date(l.expires)}</Td>
                    <Td>
                      <Badge tone={l.state === "valid" ? "pitch" : l.state === "expiring" ? "amber" : "red"}>
                        {l.state === "valid" ? t("development.valid") : l.state === "expiring" ? t("development.expiresIn", { n: days }) : t("development.expired")}
                      </Badge>
                    </Td>
                    <Td className="text-right">
                      <span className="inline-flex gap-1.5">
                        {l.state !== "valid" && (
                          <Button size="sm" disabled={renew.busy} onClick={() => void renewFor(l)}>
                            {t("development.renew")}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" aria-label={t("development.editDatesFor", { name: l.officialName })} onClick={() => setEditing(l)}>
                          <Pencil size={14} />
                        </Button>
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing && <LicenceDialog licence={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onDone={changed} />}
    </Card>
  );
}

function LicenceDialog({ licence, onClose, onDone }: { licence?: LicenceRow; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const picker = usePickerCountries();
  const { busy, error, run } = useAction();
  const [officialId, setOfficialId] = useState(licence?.officialId ?? "");
  const [kind, setKind] = useState<LicenceKind>(licence?.kind ?? "National D1");
  const [issued, setIssued] = useState(licence?.issued ?? today());
  const [expires, setExpires] = useState(licence?.expires ?? addDays(today(), 365));
  const [tried, setTried] = useState(false);
  const datesBad = !isDay(issued) || !isDay(expires) || expires < issued;

  async function submit() {
    setTried(true);
    if ((!licence && !officialId) || datesBad) return;
    const res = await run(async () => {
      if (licence) await updateLicence(licence.id, { issued, expires });
      else await addLicence({ officialId, kind, issued, expires });
    });
    if (res.ok) {
      toast.push("success", t("development.licenceSaved"));
      onDone();
    }
  }

  return (
    <Dialog
      size={licence ? "sm" : "lg"}
      title={t(licence ? "development.licenceForm.editTitle" : "development.licenceForm.title")}
      description={licence ? `${licence.officialName} · ${licence.kind}` : t("development.varNote")}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      footer={<Footer busy={busy} onClose={onClose} submit={t("common.save")} />}
    >
      <div className="space-y-4">
        {!licence && (
          <>
            <OfficialPicker value={officialId} onChange={setOfficialId} country={picker.country} countries={picker.countries} error={tried && !officialId ? t("admin.errors.pickOfficial") : undefined} />
            <SelectField label={t("development.licenceForm.kind")} value={kind} onChange={(v) => setKind(v as LicenceKind)} options={LICENCE_KINDS.map((k) => ({ value: k, label: k }))} />
          </>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField type="date" label={t("development.issued")} value={issued} onChange={setIssued} required />
          <TextField type="date" label={t("development.expires")} value={expires} min={issued} onChange={setExpires} required error={tried && datesBad ? t("development.errors.dates") : undefined} />
        </div>
        <FormError error={error} />
      </div>
    </Dialog>
  );
}

/* --------------------------------------------------------------- fitness */

/** Records (or replaces) an official's fitness test. A failed test needs a retest date, as the API insists. */
export function FitnessDialog({ test, onClose, onDone }: { test?: FitnessTest; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const picker = usePickerCountries();
  const { busy, error, run } = useAction();
  const [officialId, setOfficialId] = useState(test?.refereeId ?? "");
  const [date, setDate] = useState(today());
  const [r1, setR1] = useState<"passed" | "failed">(test?.test1.result ?? "passed");
  const [sprint, setSprint] = useState(test ? String(test.test1.bestSprint) : "");
  const [r2, setR2] = useState<"passed" | "failed">(test?.test2.result ?? "passed");
  const [laps, setLaps] = useState(test ? String(test.test2.laps) : "");
  const [retest, setRetest] = useState(test?.retestDate ?? addDays(today(), 30));
  const [tried, setTried] = useState(false);
  const failed = r1 === "failed" || r2 === "failed";
  const sprintNum = Number(sprint.replace(",", "."));
  const sprintBad = !sprint.trim() || Number.isNaN(sprintNum) || sprintNum < 3 || sprintNum > 15;
  const lapsBad = !/^\d{1,3}$/.test(laps.trim()) || Number(laps) > 100;
  const retestBad = failed && (!isDay(retest) || retest < date);
  const results = [
    { value: "passed", label: t("development.passed") },
    { value: "failed", label: t("development.failed") },
  ];

  async function submit() {
    setTried(true);
    if (!officialId || !isDay(date) || sprintBad || lapsBad || retestBad) return;
    const res = await run(() =>
      recordFitness(officialId, { date, test1: { result: r1, bestSprint: sprintNum }, test2: { result: r2, laps: Number(laps) }, retestDate: failed ? retest : null }),
    );
    if (res.ok) {
      toast.push("success", t("development.fitnessSaved"));
      onDone();
    }
  }

  return (
    <Dialog
      size="lg"
      title={t("development.fitnessForm.title")}
      description={t("development.fitnessSub")}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      footer={<Footer busy={busy} onClose={onClose} submit={t("common.save")} />}
    >
      <div className="space-y-4">
        {test ? (
          <p className="text-sm font-semibold text-chalk">{officialById(test.refereeId)?.name ?? test.refereeId}</p>
        ) : (
          <OfficialPicker value={officialId} onChange={setOfficialId} country={picker.country} countries={picker.countries} error={tried && !officialId ? t("admin.errors.pickOfficial") : undefined} />
        )}
        <TextField type="date" label={t("common.date")} value={date} max={today()} onChange={setDate} required className="sm:w-48" />
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-1 text-xs font-semibold text-chalk-faint">{t("development.test1")}</legend>
          <SelectField label={t("development.fitnessForm.result")} value={r1} onChange={(v) => setR1(v as "passed" | "failed")} options={results} />
          <TextField label={t("development.fitnessForm.sprint")} value={sprint} onChange={setSprint} inputMode="decimal" required error={tried && sprintBad ? t("development.errors.sprint") : undefined} />
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-1 text-xs font-semibold text-chalk-faint">{t("development.test2")}</legend>
          <SelectField label={t("development.fitnessForm.result")} value={r2} onChange={(v) => setR2(v as "passed" | "failed")} options={results} />
          <TextField label={t("development.fitnessForm.laps")} value={laps} onChange={setLaps} inputMode="numeric" required error={tried && lapsBad ? t("development.errors.laps") : undefined} />
        </fieldset>
        {failed && (
          <TextField
            type="date"
            label={t("development.retest")}
            value={retest}
            min={date}
            onChange={setRetest}
            required
            hint={t("development.fitnessForm.retestHint")}
            error={tried && retestBad ? t("development.errors.retest_required") : undefined}
            className="sm:w-48"
          />
        )}
        <FormError error={error} />
      </div>
    </Dialog>
  );
}

/* --------------------------------------------------------------- courses */

const KINDS: CourseKind[] = ["course", "exam", "camp"];

export function CoursesPanel() {
  const t = useT();
  const { locale } = useLocale();
  const actor = useActor();
  const admin = isAdmin(actor);
  const [tick, setTick] = useState(0);
  const list = useResource(`courses|${tick}`, (signal) => listCourses(signal));
  const feds = useResource("federations", (signal) => listFederations(signal), admin);
  const [modal, setModal] = useState<{ kind: "new" } | { kind: "enrol" | "complete"; course: CourseRow } | null>(null);
  const fedCode = useMemo(() => new Map((feds.data ?? []).map((f) => [f.id, f.code])), [feds.data]);

  const done = () => {
    setModal(null);
    setTick((n) => n + 1);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="primary" onClick={() => setModal({ kind: "new" })}>
          <Plus size={15} />
          {t("development.newCourse")}
        </Button>
      </div>
      {list.loading ? (
        <ListSkeleton rows={3} />
      ) : list.error ? (
        <ErrorState onRetry={list.reload} />
      ) : (list.data ?? []).length === 0 ? (
        <Card>
          <EmptyState title={t("common.empty")} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(list.data ?? []).map((course) => {
            const own = course.federationId !== null;
            const canComplete = admin || own;
            return (
              <Card key={course.id}>
                <div className="flex items-start gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-ink-3 text-chalk-dim">
                    <GraduationCap size={15} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-chalk">{pickLocalized(course.name, locale)}</h3>
                    <p className="text-xs text-chalk-faint">
                      {t(`development.courseForm.kinds.${course.kind}`)} · {course.provider} · {course.hours}
                      {t("common.hours")}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge tone={course.state === "completed" ? "pitch" : course.state === "enrolled" ? "amber" : "neutral"}>
                    {t(course.state === "completed" ? "development.completed" : course.state === "enrolled" ? "development.enrolled" : "development.notStarted")}
                  </Badge>
                  <Badge tone="neutral">{own ? (fedCode.get(course.federationId!) ?? actor?.federationCode ?? t("development.ownCourse")) : t("development.platformWide")}</Badge>
                </div>
                <p className="mt-3 text-xs text-chalk-faint">{t("development.officialsCount", { n: course.officialIds.length })}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {course.officialIds.slice(0, 8).map((id) => (
                    <Link key={id} href={refereeHref(id)} className="rounded border border-line px-1.5 py-0.5 text-[10.5px] text-chalk-faint hover:text-chalk">
                      {officialById(id)?.name ?? id}
                    </Link>
                  ))}
                  {course.officialIds.length > 8 && <span className="px-1.5 py-0.5 text-[10.5px] text-chalk-faint">+{course.officialIds.length - 8}</span>}
                </div>
                {course.state !== "completed" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setModal({ kind: "enrol", course })}>
                      <UserPlus size={14} />
                      {t("development.enrol")}
                    </Button>
                    {course.officialIds.length > 0 && (
                      <Button size="sm" onClick={() => setModal({ kind: "complete", course })} disabled={!canComplete && course.officialIds.length === 0}>
                        <BadgeCheck size={14} />
                        {t("development.complete")}
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      {modal?.kind === "new" && <CourseDialog federations={feds.data ?? []} admin={admin} onClose={() => setModal(null)} onDone={done} />}
      {modal?.kind === "enrol" && <EnrolDialog course={modal.course} onClose={() => setModal(null)} onDone={done} />}
      {modal?.kind === "complete" && <CompleteDialog course={modal.course} onClose={() => setModal(null)} onDone={done} />}
    </div>
  );
}

function CourseDialog({ federations, admin, onClose, onDone }: { federations: Array<{ id: string; code: string; name: string }>; admin: boolean; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const { busy, error, run } = useAction();
  const [kind, setKind] = useState<CourseKind>("course");
  const [name, setName] = useState({ fr: "", en: "", es: "", de: "" });
  const [provider, setProvider] = useState("");
  const [hours, setHours] = useState("");
  const [federationId, setFederationId] = useState("");
  const [tried, setTried] = useState(false);
  const nameBad = (k: "fr" | "en") => name[k].trim().length < 2;
  const providerBad = provider.trim().length < 2;
  const hoursBad = !/^\d{1,3}$/.test(hours.trim()) || Number(hours) < 1 || Number(hours) > 400;

  async function submit() {
    setTried(true);
    if (nameBad("fr") || nameBad("en") || providerBad || hoursBad) return;
    const res = await run(() =>
      createCourse({
        ...(admin ? { federationId: federationId || null } : {}),
        kind,
        name: { fr: name.fr.trim(), en: name.en.trim(), ...(name.es.trim() ? { es: name.es.trim() } : {}), ...(name.de.trim() ? { de: name.de.trim() } : {}) },
        provider: provider.trim(),
        hours: Number(hours),
      }),
    );
    if (res.ok) {
      toast.push("success", t("development.courseCreated"));
      onDone();
    }
  }

  return (
    <Dialog size="lg" title={t("development.courseForm.title")} onClose={onClose} onSubmit={() => void submit()} busy={busy} footer={<Footer busy={busy} onClose={onClose} submit={t("development.courseForm.submit")} />}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label={t("development.courseForm.kind")} value={kind} onChange={(v) => setKind(v as CourseKind)} options={KINDS.map((k) => ({ value: k, label: t(`development.courseForm.kinds.${k}`) }))} />
          {admin && (
            <SelectField
              label={t("development.courseForm.scope")}
              value={federationId}
              onChange={setFederationId}
              placeholder={t("development.platformWide")}
              options={federations.map((f) => ({ value: f.id, label: `${f.code} · ${f.name}` }))}
            />
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label={t("development.courseForm.nameFr")} value={name.fr} onChange={(v) => setName((n) => ({ ...n, fr: v }))} required maxLength={120} error={tried && nameBad("fr") ? t("admin.errors.required") : undefined} />
          <TextField label={t("development.courseForm.nameEn")} value={name.en} onChange={(v) => setName((n) => ({ ...n, en: v }))} required maxLength={120} error={tried && nameBad("en") ? t("admin.errors.required") : undefined} />
          <TextField label={t("development.courseForm.nameEs")} value={name.es} onChange={(v) => setName((n) => ({ ...n, es: v }))} maxLength={120} />
          <TextField label={t("development.courseForm.nameDe")} value={name.de} onChange={(v) => setName((n) => ({ ...n, de: v }))} maxLength={120} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label={t("development.courseForm.provider")} value={provider} onChange={setProvider} required maxLength={80} error={tried && providerBad ? t("admin.errors.required") : undefined} />
          <TextField label={t("development.courseForm.hours")} value={hours} onChange={setHours} inputMode="numeric" required error={tried && hoursBad ? t("development.errors.hours") : undefined} />
        </div>
        <FormError error={error} />
      </div>
    </Dialog>
  );
}

function EnrolDialog({ course, onClose, onDone }: { course: CourseRow; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const { locale } = useLocale();
  const toast = useToast();
  const picker = usePickerCountries();
  const { busy, error, run } = useAction();
  const [ids, setIds] = useState<string[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [tried, setTried] = useState(false);
  const nameOf = (id: string) => names[id] ?? officialById(id)?.name ?? id;

  async function submit() {
    setTried(true);
    if (ids.length === 0) return;
    const res = await run(() => enrolOfficials(course.id, ids));
    if (res.ok) {
      toast.push("success", t("development.enrolledToast", { n: res.value.enrolled }));
      onDone();
    }
  }

  return (
    <Dialog
      size="lg"
      title={t("development.enrolForm.title")}
      description={pickLocalized(course.name, locale)}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      footer={<Footer busy={busy} onClose={onClose} submit={t("development.enrolForm.submit", { n: ids.length })} />}
    >
      <div className="space-y-4">
        <p className="text-sm text-chalk-dim">{t("development.enrolForm.hint")}</p>
        <OfficialPicker
          value=""
          onChange={(id) => id && !ids.includes(id) && !course.officialIds.includes(id) && setIds((s) => [...s, id])}
          onPickOption={(o) => setNames((n) => ({ ...n, [o.id]: o.name }))}
          country={picker.country}
          countries={picker.countries}
          error={tried && ids.length === 0 ? t("admin.errors.pickOfficial") : undefined}
        />
        {ids.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label={t("development.enrolForm.chosen")}>
            {ids.map((id) => (
              <li key={id} className="inline-flex items-center gap-1 rounded-full border border-line bg-ink-3 py-0.5 ps-2.5 pe-1 text-xs text-chalk">
                {nameOf(id)}
                <button type="button" onClick={() => setIds((s) => s.filter((x) => x !== id))} aria-label={t("development.enrolForm.remove", { name: nameOf(id) })} className="rounded-full p-0.5 hover:bg-red-500/20">
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <FormError error={error} />
      </div>
    </Dialog>
  );
}

function CompleteDialog({ course, onClose, onDone }: { course: CourseRow; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const { locale } = useLocale();
  const toast = useToast();
  const { busy, error, run } = useAction();
  const [ids, setIds] = useState<Set<string>>(new Set(course.officialIds));

  async function submit() {
    if (ids.size === 0) return;
    const res = await run(() => completeOfficials(course.id, [...ids]));
    if (res.ok) {
      toast.push("success", t("development.completedToast", { n: res.value.completed }));
      onDone();
    }
  }

  return (
    <Dialog
      title={t("development.completeForm.title")}
      description={pickLocalized(course.name, locale)}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      footer={<Footer busy={busy} onClose={onClose} submit={t("development.completeForm.submit", { n: ids.size })} />}
    >
      <div className="space-y-3">
        <p className="text-sm text-chalk-dim">{t("development.completeForm.hint")}</p>
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {course.officialIds.map((id) => (
            <li key={id}>
              <label className="flex min-h-10 items-center gap-2.5 rounded-lg px-2 text-sm text-chalk hover:bg-ink-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-red-600"
                  checked={ids.has(id)}
                  onChange={() =>
                    setIds((s) => {
                      const next = new Set(s);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    })
                  }
                />
                {officialById(id)?.name ?? id}
              </label>
            </li>
          ))}
        </ul>
        <FormError error={error} />
      </div>
    </Dialog>
  );
}
