"use client";

import { useState } from "react";
import { ChevronDown, Plus, RefreshCcw, Scale, Trash2 } from "@/components/icons/glyphs";
import { Badge, Button, Card, CardHeader, Meter } from "@/components/ui";
import { listCriteria, saveCriteria } from "@/lib/api/assessments";
import {
  evenWeights,
  GRID_MAX,
  GRID_MIN,
  gridChanged,
  gridRowsFrom,
  gridTotal,
  hasGridErrors,
  removedCriteria,
  toGrid,
  validateGrid,
  type GridErrors,
  type GridRow,
} from "@/lib/assessments/grid";
import { useResource } from "@/lib/admin/hooks";
import { useDataset } from "@/lib/dataset/DatasetProvider";
import { pickLocalized } from "@/lib/i18n/localized";
import type { Criterion } from "@/lib/store/types";
import { useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";
import { AdminPage } from "./AdminPage";
import { ConfirmDialog } from "./ConfirmDialog";
import { TextField } from "./fields";
import { ErrorState, ListSkeleton } from "./states";

const LANGS = ["fr", "en", "es", "de"] as const;
const NO_ERRORS: GridErrors = { rows: {}, grid: null };

function Editor({ saved, onSaved }: { saved: Criterion[]; onSaved: () => void }) {
  const t = useT();
  const { locale } = useLocale();
  const toast = useToast();
  const [rows, setRows] = useState<GridRow[]>(() => gridRowsFrom(saved));
  const [errors, setErrors] = useState<GridErrors>(NO_ERRORS);
  const [confirming, setConfirming] = useState(false);
  const total = gridTotal(rows);
  const dirty = gridChanged(saved, rows);
  const dropped = removedCriteria(saved, rows);

  const edit = (i: number, patch: Partial<GridRow>) => {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setErrors((e) => {
      const next = { ...e.rows };
      delete next[i];
      return { rows: next, grid: null };
    });
  };
  const move = (i: number, by: -1 | 1) =>
    setRows((rs) => {
      const j = i + by;
      if (j < 0 || j >= rs.length) return rs;
      const next = rs.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const reset = () => {
    setRows(gridRowsFrom(saved));
    setErrors(NO_ERRORS);
  };

  function check() {
    const found = validateGrid(rows);
    setErrors(found);
    if (!hasGridErrors(found)) setConfirming(true);
  }

  return (
    <>
      <Card>
        <CardHeader
          icon={Scale}
          tint="gold"
          title={t("assessments.grid.criteria", { n: rows.length })}
          subtitle={t("assessments.grid.criteriaHint")}
          action={
            <Badge tone={total === 100 ? "pitch" : "red"}>
              {t("assessments.grid.total")} <span className="board">{total}</span> / 100
            </Badge>
          }
        />
        <Meter value={Math.min(total, 100)} tone={total === 100 ? "pitch" : total > 100 ? "red" : "amber"} className="mb-4" />
        {errors.grid && (
          <p role="alert" className="mb-3 text-sm text-red-500">
            {t(errors.grid)}
          </p>
        )}

        <ol className="space-y-3">
          {rows.map((r, i) => {
            const e = errors.rows[i] ?? {};
            const name = pickLocalized({ fr: r.fr, en: r.en, es: r.es, de: r.de }, locale) || t("assessments.grid.untitled");
            return (
              <li key={`${r.key}-${i}`} className="rounded-[10px] border border-line bg-ink-1 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-medium text-chalk">
                    <span className="board mr-2 text-chalk-faint">{i + 1}</span>
                    {name}
                    {saved.some((c) => c.key === r.key) ? null : (
                      <Badge tone="var" className="ml-2">
                        {t("assessments.grid.new")}
                      </Badge>
                    )}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t("assessments.grid.up", { name })}>
                      <ChevronDown size={14} className="rotate-180" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={t("assessments.grid.down", { name })}>
                      <ChevronDown size={14} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                      disabled={rows.length <= GRID_MIN}
                      aria-label={t("assessments.grid.remove", { name })}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-[repeat(4,minmax(0,1fr))_6rem]">
                  {LANGS.map((l) => (
                    <TextField
                      key={l}
                      label={t(`assessments.grid.label.${l}`)}
                      value={r[l]}
                      onChange={(v) => edit(i, { [l]: v })}
                      maxLength={80}
                      required={l === "fr" || l === "en"}
                      error={e[l] ? t(e[l]) : undefined}
                    />
                  ))}
                  <TextField
                    label={t("assessments.grid.weight")}
                    inputMode="numeric"
                    value={r.weight}
                    onChange={(v) => edit(i, { weight: v })}
                    maxLength={3}
                    required
                    error={e.weight ? t(e.weight) : undefined}
                  />
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setRows((rs) => [...rs, { key: "", fr: "", en: "", es: "", de: "", weight: "" }])}
              disabled={rows.length >= GRID_MAX}
            >
              <Plus size={13} />
              {t("assessments.grid.add")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRows(evenWeights)}>
              <Scale size={13} />
              {t("assessments.grid.even")}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button onClick={reset} disabled={!dirty}>
              <RefreshCcw size={13} />
              {t("assessments.grid.reset")}
            </Button>
            <Button variant="primary" onClick={check} disabled={!dirty}>
              {t("assessments.grid.save")}
            </Button>
          </div>
        </div>
      </Card>

      {confirming && (
        <ConfirmDialog
          title={t("assessments.grid.confirmTitle")}
          confirmLabel={t("assessments.grid.save")}
          perform={() => saveCriteria(toGrid(rows))}
          onCancel={() => setConfirming(false)}
          onDone={() => {
            setConfirming(false);
            toast.push("success", t("assessments.grid.saved"));
            onSaved();
          }}
        >
          <p>{t("assessments.grid.confirmBody")}</p>
          {dropped.length > 0 && (
            <p className="mt-2 text-amber">
              {t("assessments.grid.dropped", { names: dropped.map((c) => pickLocalized(c.label, locale)).join(", ") })}
            </p>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}

/** The platform's evaluation grid: what observers mark and how much each criterion weighs in the overall. */
export function GridView() {
  const { refresh } = useDataset();
  const grid = useResource("evaluation-criteria", (signal) => listCriteria(signal));

  return (
    <AdminPage titleKey="assessments.grid.title" subtitleKey="assessments.grid.subtitle">
      {grid.loading ? (
        <ListSkeleton rows={6} />
      ) : grid.error || !grid.data ? (
        <ErrorState onRetry={grid.reload} />
      ) : (
        // a fresh editor after each save, seeded from what the server kept
        <Editor
          key={JSON.stringify(grid.data)}
          saved={grid.data}
          onSaved={() => {
            grid.reload();
            void refresh(); // reports, rankings and the observer form read the grid from the snapshot
          }}
        />
      )}
    </AdminPage>
  );
}
