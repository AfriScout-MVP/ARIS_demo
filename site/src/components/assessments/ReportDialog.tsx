"use client";

import { useState } from "react";
import { Plus, X } from "@/components/icons/glyphs";
import { Button } from "@/components/ui";
import { Dialog } from "@/components/admin/Dialog";
import { FormError, TextAreaField, TextField } from "@/components/admin/fields";
import { OfficialPicker } from "@/components/admin/OfficialPicker";
import { createReport, updateReport, type AssessmentRow } from "@/lib/api/assessments";
import {
  clipsFor,
  hasReportErrors,
  marksOf,
  notesFor,
  validateReport,
  valuesFrom,
  weightedOverall,
  type ReportErrors,
  type ReportValues,
} from "@/lib/assessments/rules";
import { useAction } from "@/lib/admin/hooks";
import { pickLocalized } from "@/lib/i18n/localized";
import type { Criterion } from "@/lib/store/types";
import { useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";

type Mode =
  /** A new report on `matchId`. `pickObserver`: staff say who wrote it. */
  | { kind: "new"; matchId: string; pickObserver?: { country?: string } }
  /** A draft the observer (or staff) carries on with. */
  | { kind: "draft"; report: AssessmentRow }
  /** Staff correcting a filed report: a reason is required and logged. */
  | { kind: "correct"; report: AssessmentRow };

/**
 * The observer's report on the platform grid. A draft may leave marks blank; filing needs every one, sends
 * the report to the federation and moves the referee's figures. A filed report is then a record.
 */
export function ReportDialog({
  mode,
  grid,
  title,
  onClose,
  onDone,
}: {
  mode: Mode;
  grid: Criterion[];
  /** "Home – Away · date". */
  title: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const toast = useToast();
  const { busy, error, serverFields, run } = useAction();
  const existing = mode.kind === "new" ? null : mode.report;
  const [values, setValues] = useState<ReportValues>(() => valuesFrom(existing, grid, locale, (l) => pickLocalized(l, locale)));
  const [errors, setErrors] = useState<ReportErrors>({ marks: {}, clips: {} });
  const [observerId, setObserverId] = useState("");
  const [observerError, setObserverError] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const overall = weightedOverall(marksOf(values), grid);

  const setMark = (key: string, v: string) => {
    setValues((s) => ({ ...s, marks: { ...s.marks, [key]: v } }));
    setErrors((e) => {
      const marks = { ...e.marks };
      delete marks[key];
      return { ...e, marks };
    });
  };
  const setClip = (i: number, patch: Partial<ReportValues["clips"][number]>) =>
    setValues((s) => ({ ...s, clips: s.clips.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));

  async function save(filing: boolean) {
    const found = validateReport(values, grid, filing || mode.kind === "correct");
    setErrors(found);
    const needObserver = mode.kind === "new" && Boolean(mode.pickObserver) && !observerId;
    setObserverError(needObserver);
    const needReason = mode.kind === "correct" && reason.trim().length < 3;
    setReasonError(needReason);
    if (hasReportErrors(found) || needObserver || needReason) return;

    const marks = marksOf(values);
    const notes = notesFor(values.notes, locale);
    const clips = clipsFor(values.clips, locale);
    const res = await run(() =>
      mode.kind === "new"
        ? createReport({ matchId: mode.matchId, ...(mode.pickObserver ? { observerId } : {}), marks, notes, clips, state: filing ? "filed" : "draft" })
        : updateReport(mode.report.id, { marks, notes, clips, ...(filing && mode.kind === "draft" ? { file: true } : {}), ...(mode.kind === "correct" ? { reason: reason.trim() } : {}) }),
    );
    if (res.ok) {
      toast.push("success", t(mode.kind === "correct" ? "assessments.form.corrected" : filing ? "assessments.form.filedToast" : "assessments.form.savedDraft"));
      onDone();
    }
  }

  const canDraft = mode.kind !== "correct";
  const shownError = error?.code === "duplicate" ? { ...error, key: "assessments.form.errors.duplicate" as const } : error;

  return (
    <Dialog
      size="lg"
      title={t(mode.kind === "correct" ? "assessments.form.correctTitle" : "assessments.form.title")}
      description={title}
      onClose={onClose}
      onSubmit={() => void save(true)}
      busy={busy}
      footer={
        <>
          <Button type="button" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          {canDraft && (
            <Button type="button" variant="secondary" onClick={() => void save(false)} disabled={busy}>
              {t("assessments.form.saveDraft")}
            </Button>
          )}
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? t("admin.common.working") : t(mode.kind === "correct" ? "assessments.form.saveCorrection" : "assessments.form.file")}
          </Button>
        </>
      }
    >
      <FormError error={shownError} />
      {mode.kind === "new" && mode.pickObserver && (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-chalk-dim">{t("assessments.observer")}</p>
          <OfficialPicker
            value={observerId}
            onChange={(id) => {
              setObserverId(id);
              setObserverError(false);
            }}
            country={mode.pickObserver.country}
            error={observerError ? t("assessments.form.errors.observer") : serverFields.observerId ? t(serverFields.observerId) : undefined}
          />
        </div>
      )}

      <fieldset>
        <legend className="mb-2 flex w-full items-center justify-between text-xs font-semibold text-chalk-dim">
          <span>{t("assessments.kpis")}</span>
          <span className="board text-sm text-chalk">
            {t("assessments.overall")} {overall.toFixed(1)} / 10
          </span>
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {grid.map((c) => (
            <TextField
              key={c.key}
              label={`${pickLocalized(c.label, locale)} · ${c.weight}%`}
              inputMode="decimal"
              value={values.marks[c.key] ?? ""}
              onChange={(v) => setMark(c.key, v)}
              error={errors.marks[c.key] ? t(errors.marks[c.key]) : undefined}
              placeholder="0 – 10"
              maxLength={4}
            />
          ))}
        </div>
        <p className="mt-2 text-[11px] text-chalk-faint">{t("assessments.form.markHint")}</p>
      </fieldset>

      <TextAreaField label={t("assessments.notes")} value={values.notes} onChange={(v) => setValues((s) => ({ ...s, notes: v }))} rows={5} maxLength={4000} hint={t("assessments.form.notesHint")} />

      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-semibold text-chalk-dim">{t("assessments.clips")}</legend>
        {values.clips.map((clip, i) => (
          <div key={i} className="grid grid-cols-[5rem_1fr_auto] items-start gap-2">
            <TextField label={t("assessments.form.minute")} inputMode="numeric" value={clip.minute} onChange={(v) => setClip(i, { minute: v })} maxLength={3} />
            <TextField
              label={t("assessments.form.clipText")}
              value={clip.text}
              onChange={(v) => setClip(i, { text: v })}
              maxLength={120}
              error={errors.clips[i] ? t(errors.clips[i]) : undefined}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-6"
              aria-label={t("assessments.form.removeClip")}
              onClick={() => setValues((s) => ({ ...s, clips: s.clips.filter((_, j) => j !== i) }))}
            >
              <X size={14} />
            </Button>
          </div>
        ))}
        {values.clips.length < 20 && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setValues((s) => ({ ...s, clips: [...s.clips, { minute: "", text: "" }] }))}>
            <Plus size={13} />
            {t("assessments.form.addClip")}
          </Button>
        )}
      </fieldset>

      {mode.kind === "correct" && (
        <TextField
          label={t("assessments.form.reason")}
          value={reason}
          onChange={(v) => {
            setReason(v);
            setReasonError(false);
          }}
          error={reasonError ? t("assessments.form.errors.reason") : undefined}
          hint={t("assessments.form.reasonHint")}
          maxLength={300}
          required
        />
      )}
      {mode.kind !== "correct" && <p className="text-xs text-chalk-faint">{t("assessments.form.fileHint")}</p>}
    </Dialog>
  );
}
