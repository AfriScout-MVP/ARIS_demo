"use client";

import { useState } from "react";
import { Plus, ShieldAlert, Trash2 } from "@/components/icons/glyphs";
import { Badge, Button, Card, CardHeader, EmptyState } from "@/components/ui";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { FormError, SelectField, TextField } from "@/components/admin/fields";
import { listTeams } from "@/lib/api/admin";
import { declareConflict, removeConflict, type Conflict } from "@/lib/api/officials";
import { CONFLICT_KINDS, emptyConflict, toConflictBody, validateConflict, type ConflictErrors, type ConflictValues } from "@/lib/officials/conflicts";
import { useAction, useResource } from "@/lib/admin/hooks";
import { countries, countryName } from "@/lib/store";
import { useFormatters, useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";

/**
 * Links that keep an official off a match: a club they played for, a team a relative coaches, a country they are
 * tied to. The official declares them; the federation may add one for them, and only staff may remove one.
 */
export function ConflictsCard({
  officialId,
  countryCode,
  conflicts,
  canRemove,
  onChanged,
}: {
  officialId: string;
  /** The official's country: its teams are offered as suggestions. */
  countryCode: string;
  conflicts: Conflict[];
  canRemove: boolean;
  onChanged: () => void;
}) {
  const t = useT();
  const fmt = useFormatters();
  const { locale } = useLocale();
  const toast = useToast();
  const declare = useAction();
  const [adding, setAdding] = useState(false);
  const [values, setValues] = useState<ConflictValues>(emptyConflict);
  const [errors, setErrors] = useState<ConflictErrors>({});
  const [removing, setRemoving] = useState<Conflict | null>(null);
  const teams = useResource(`teams|${countryCode}`, (signal) => listTeams(countryCode, signal), adding && values.kind !== "country");
  const listId = `conflict-teams-${officialId}`;

  const set = <K extends keyof ConflictValues>(key: K, value: ConflictValues[K]) => {
    setValues((v) => ({ ...v, [key]: value, ...(key === "kind" ? { subject: "" } : {}) }));
    setErrors((e) => ({ ...e, [key]: undefined, ...(key === "kind" ? { subject: undefined } : {}) }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const found = validateConflict(values, conflicts);
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    const res = await declare.run(() => declareConflict(officialId, toConflictBody(values)));
    if (res.ok) {
      toast.push("success", t("officials.conflicts.declared"));
      setValues(emptyConflict());
      setAdding(false);
      onChanged();
    }
  }

  const subjectLabel = (c: Pick<Conflict, "kind" | "subject">) => (c.kind === "country" ? `${countryName(c.subject, locale)} (${c.subject})` : c.subject);
  const serverError =
    declare.error?.code === "duplicate"
      ? { ...declare.error, key: "officials.conflicts.errors.duplicate" as const }
      : declare.error?.code === "unknown_country"
        ? { ...declare.error, key: "officials.conflicts.errors.country" as const }
        : declare.error;

  return (
    <Card>
      <CardHeader
        icon={ShieldAlert}
        tint="amber"
        title={t("officials.conflicts.title")}
        subtitle={t(canRemove ? "officials.conflicts.staffHint" : "officials.conflicts.selfHint")}
        action={
          !adding && (
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
              <Plus size={13} />
              {t("officials.conflicts.add")}
            </Button>
          )
        }
      />

      {conflicts.length === 0 && !adding ? (
        <EmptyState title={t("officials.conflicts.empty")} hint={t("officials.conflicts.emptyHint")} />
      ) : (
        <ul className="space-y-2">
          {conflicts.map((c) => (
            <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 rounded-[10px] border border-line bg-ink-1 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm text-chalk">
                  <Badge tone="amber" className="mr-2">
                    {t(`officials.conflicts.kinds.${c.kind}`)}
                  </Badge>
                  {subjectLabel(c)}
                </p>
                {c.note && <p className="mt-1 text-xs text-chalk-dim">{c.note}</p>}
                <p className="mt-1 text-[11px] text-chalk-faint">{t("officials.conflicts.declaredOn", { date: fmt.date(c.declaredAt.slice(0, 10)) })}</p>
              </div>
              {canRemove && (
                <Button size="sm" variant="ghost" onClick={() => setRemoving(c)} aria-label={t("officials.conflicts.remove")}>
                  <Trash2 size={13} />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <form onSubmit={submit} className="mt-3 space-y-3 rounded-[10px] border border-line bg-ink-1 p-3" noValidate>
          <FormError error={serverError} />
          <SelectField
            label={t("officials.conflicts.fields.kind")}
            value={values.kind}
            onChange={(v) => set("kind", v as ConflictValues["kind"])}
            options={CONFLICT_KINDS.map((k) => ({ value: k, label: t(`officials.conflicts.kinds.${k}`) }))}
          />
          {values.kind === "country" ? (
            <SelectField
              label={t("officials.conflicts.fields.country")}
              value={values.subject}
              onChange={(v) => set("subject", v)}
              placeholder={t("officials.chooseCountry")}
              options={countries
                .map((c) => ({ value: c.code, label: countryName(c.code, locale) }))
                .sort((a, b) => a.label.localeCompare(b.label, locale))}
              error={errors.subject ? t(errors.subject) : undefined}
              required
            />
          ) : (
            <>
              <TextField
                label={t(`officials.conflicts.fields.${values.kind}`)}
                value={values.subject}
                onChange={(v) => set("subject", v)}
                list={listId}
                maxLength={80}
                autoComplete="off"
                hint={t("officials.conflicts.hints.name")}
                error={errors.subject ? t(errors.subject) : undefined}
                required
              />
              <datalist id={listId}>
                {(teams.data ?? []).map((team) => (
                  <option key={team.id} value={team.name} />
                ))}
              </datalist>
            </>
          )}
          <TextField
            label={t("officials.conflicts.fields.note")}
            value={values.note}
            onChange={(v) => set("note", v)}
            maxLength={300}
            hint={t("officials.conflicts.hints.note")}
            error={errors.note ? t(errors.note) : undefined}
          />
          {!canRemove && <p className="text-[11px] text-chalk-faint">{t("officials.conflicts.hints.permanent")}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              onClick={() => {
                setAdding(false);
                setValues(emptyConflict());
                setErrors({});
                declare.reset();
              }}
              disabled={declare.busy}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={declare.busy}>
              {declare.busy ? t("admin.common.working") : t("officials.conflicts.declare")}
            </Button>
          </div>
        </form>
      )}

      {removing && (
        <ConfirmDialog
          title={t("officials.conflicts.removeTitle")}
          confirmLabel={t("officials.conflicts.remove")}
          danger
          perform={() => removeConflict(officialId, removing.id)}
          onCancel={() => setRemoving(null)}
          onDone={() => {
            toast.push("success", t("officials.conflicts.removed"));
            setRemoving(null);
            onChanged();
          }}
        >
          {t("officials.conflicts.removeBody", { subject: subjectLabel(removing) })}
        </ConfirmDialog>
      )}
    </Card>
  );
}
