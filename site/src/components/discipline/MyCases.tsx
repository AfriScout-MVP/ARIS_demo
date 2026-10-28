"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldAlert } from "@/components/icons/glyphs";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import { FormError, TextAreaField } from "@/components/admin/fields";
import { appealCase, listCases } from "@/lib/api/discipline";
import { getDefence, fileDefence } from "@/lib/api/me";
import { useAction, useResource } from "@/lib/admin/hooks";
import { CASE_TONE, SANCTION_TONE } from "@/lib/discipline/rules";
import { useFormatters, useT } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";

/** A referee's own procedures, with the right to appeal any decision. Hidden while there are none. */
export function MyCases() {
  const t = useT();
  const fmt = useFormatters();
  const toast = useToast();
  const [tick, setTick] = useState(0);
  const list = useResource(`my-cases|${tick}`, (signal) => listCases({}, signal));
  const { busy, error, run, reset } = useAction();
  const [appealing, setAppealing] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [defending, setDefending] = useState<string | null>(null);

  const rows = list.data ?? [];
  if (rows.length === 0) return null;

  async function send(id: string) {
    const res = await run(() => appealCase(id, note.trim()));
    if (res.ok) {
      toast.push("success", t("discipline.appeal.done"));
      setAppealing(null);
      setNote("");
      setTick((n) => n + 1);
    }
  }

  return (
    <Card tint="red">
      <CardHeader title={t("discipline.mine.title")} subtitle={t("discipline.mine.hint")} icon={ShieldAlert} tint="red" />
      <ul className="divide-y divide-line">
        {rows.map((c) => (
          <li key={c.id} className="py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-chalk">{c.summary}</p>
                <p className="text-xs text-chalk-dim">
                  {fmt.date(c.openedAt.slice(0, 10))}
                  {c.hearingAt && c.status === "hearing_scheduled" ? ` · ${t("discipline.timeline.hearing", { date: fmt.longDate(c.hearingAt.slice(0, 10)) })}` : ""}
                  {c.suspensionFrom && c.suspensionTo ? ` · ${t("discipline.timeline.window", { from: fmt.date(c.suspensionFrom), to: fmt.date(c.suspensionTo) })}` : ""}
                </p>
                {c.decision && <p className="mt-1 text-xs text-chalk-dim">{c.decision}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={CASE_TONE[c.status]}>{t(`discipline.caseStatus.${c.status}`)}</Badge>
                {c.sanction && <Badge tone={SANCTION_TONE[c.sanction]}>{t(`discipline.sanctions.${c.sanction}`)}</Badge>}
                {c.status === "decided" && appealing !== c.id && (
                  <Button
                    size="sm"
                    onClick={() => {
                      reset();
                      setAppealing(c.id);
                    }}
                  >
                    {t("discipline.mine.appeal")}
                  </Button>
                )}
                {(c.status === "opened" || c.status === "hearing_scheduled") && defending !== c.id && (
                  <Button size="sm" onClick={() => setDefending(c.id)}>
                    {t("discipline.mine.defend")}
                  </Button>
                )}
              </div>
            </div>
            {defending === c.id && <DefenceForm caseId={c.id} onClose={() => setDefending(null)} />}
            {appealing === c.id && (
              <form
                className="mt-3 space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (note.trim().length >= 5) void send(c.id);
                }}
              >
                <TextAreaField label={t("discipline.appeal.note")} hint={t("discipline.mine.appealHint")} value={note} onChange={setNote} required maxLength={2000} />
                <FormError error={error} />
                <div className="flex justify-end gap-2">
                  <Button type="button" onClick={() => setAppealing(null)} disabled={busy}>
                    {t("common.cancel")}
                  </Button>
                  <Button type="submit" variant="primary" disabled={busy || note.trim().length < 5}>
                    {busy ? t("admin.common.working") : t("discipline.mine.send")}
                  </Button>
                </div>
              </form>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** A referee's written defence on one case: pre-filled with whatever is already on file, overwritten on each save. */
function DefenceForm({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const defence = useResource(`case-defence|${caseId}`, (signal) => getDefence(caseId, signal));
  const { busy, error, run } = useAction();
  const [statement, setStatement] = useState("");
  const seeded = useRef(false);

  useEffect(() => {
    if (defence.data !== undefined && !seeded.current) {
      seeded.current = true;
      setStatement(defence.data?.statement ?? "");
    }
  }, [defence.data]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (statement.trim().length < 10) return;
    const res = await run(() => fileDefence(caseId, statement.trim()));
    if (res.ok) toast.push("success", t(res.value.updated ? "discipline.mine.defenceUpdated" : "discipline.mine.defenceSaved"));
  }

  return (
    <form className="mt-3 space-y-2" onSubmit={(e) => void submit(e)}>
      <TextAreaField
        label={t("discipline.mine.defenceLabel")}
        hint={t("discipline.mine.defendHint")}
        value={statement}
        onChange={setStatement}
        required
        minLength={10}
        maxLength={5000}
        disabled={defence.loading}
      />
      <FormError error={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onClose} disabled={busy}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" variant="primary" disabled={busy || defence.loading || statement.trim().length < 10}>
          {busy ? t("admin.common.working") : t("discipline.mine.send")}
        </Button>
      </div>
    </form>
  );
}
