"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarCheck, Check, Download, FileText, Trophy, X } from "@/components/icons/glyphs";
import { Badge, Button, Card, CardHeader, Segmented } from "@/components/ui";
import { FormError, TextField } from "@/components/admin/fields";
import { calendarHref, respondToDesignation, type MyDesignation } from "@/lib/api/me";
import { useAction } from "@/lib/admin/hooks";
import { awaitingAnswer, countByView, designationsFor, DESIGNATION_TONE, hasConvocation, type DesignationView } from "@/lib/me/rules";
import { useFormatters, useT, type TKey } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";
import { CardError, CardSkeleton, Nothing, type Loaded } from "./CardStates";

const STATE_KEY: Record<MyDesignation["state"], TKey> = { pending: "me.pending", confirmed: "me.confirmed", declined: "me.declinedState" };

function where(d: MyDesignation) {
  return [d.venue, d.city].filter(Boolean).join(", ");
}

/** Designations waiting for the referee's answer: accept, or decline with a reason. */
export function AwaitingCard({ designations }: { designations: Loaded<MyDesignation[]> }) {
  const t = useT();
  const fmt = useFormatters();
  const toast = useToast();
  const { busy, error, run, reset } = useAction();
  const [acting, setActing] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const frame = { title: t("me.awaiting"), icon: CalendarCheck, tint: "amber" as const };
  if (designations.loading) return <CardSkeleton {...frame} rows={2} />;
  if (designations.error || !designations.data) return <CardError {...frame} error={designations.error} onRetry={designations.reload} />;
  const awaiting = awaitingAnswer(designations.data);

  async function respond(d: MyDesignation, response: "accept" | "decline") {
    const key = `${d.fixtureId}:${d.role}`;
    setActing(key);
    const res = await run(() => respondToDesignation(d, response, response === "decline" ? reason.trim() : undefined));
    setActing(null);
    if (res.ok) {
      toast.push("success", t("me.answered"));
      setDeclining(null);
      setReason("");
      designations.reload();
    }
  }

  return (
    <Card tint={awaiting.length ? "amber" : undefined}>
      <CardHeader {...frame} />
      {awaiting.length === 0 ? (
        <Nothing>{t("me.nothingAwaiting")}</Nothing>
      ) : (
        <ul className="space-y-3">
          {awaiting.map((d) => {
            const key = `${d.fixtureId}:${d.role}`;
            const mine = acting === key;
            return (
              <li key={key} className="rounded-[10px] border border-line bg-ink-1 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-chalk">
                      {d.home} – {d.away}
                    </p>
                    <p className="mt-0.5 text-xs text-chalk-dim">
                      {t(`roles.${d.role}` as TKey)} · {fmt.longDate(d.date)} · {d.kickoff}
                      {where(d) ? ` · ${where(d)}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="primary" size="sm" disabled={busy} onClick={() => void respond(d, "accept")}>
                      <Check size={14} />
                      {mine && declining !== key ? t("admin.common.working") : t("me.accept")}
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        reset();
                        setDeclining(declining === key ? null : key);
                      }}
                      aria-expanded={declining === key}
                    >
                      <X size={14} />
                      {t("me.decline")}
                    </Button>
                  </div>
                </div>
                {declining === key && (
                  <form
                    className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (reason.trim().length >= 3) void respond(d, "decline");
                    }}
                  >
                    <TextField label={t("me.declineWhy")} value={reason} onChange={setReason} maxLength={300} className="flex-1" />
                    <Button type="submit" variant="danger" className="sm:mt-6" disabled={busy || reason.trim().length < 3}>
                      {mine ? t("admin.common.working") : t("me.send")}
                    </Button>
                  </form>
                )}
                {mine && <FormError error={error} />}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** What is coming up, what was declined, or everything — with the convocation of a published crew and the calendar file. */
export function DesignationsCard({ designations }: { designations: Loaded<MyDesignation[]> }) {
  const t = useT();
  const fmt = useFormatters();
  const [view, setView] = useState<DesignationView>("upcoming");
  const frame = { title: t("selfService.designations.title"), subtitle: t("selfService.designations.hint"), icon: Trophy, tint: "pitch" as const };
  if (designations.loading) return <CardSkeleton {...frame} />;
  if (designations.error || !designations.data) return <CardError {...frame} error={designations.error} onRetry={designations.reload} />;
  const counts = countByView(designations.data);
  const rows = designationsFor(designations.data, view);

  return (
    <Card>
      <CardHeader
        {...frame}
        action={
          <a
            href={calendarHref}
            download="aris-designations.ics"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-field bg-ink-2 px-3 py-1.5 text-xs font-medium text-chalk-dim transition-colors hover:bg-ink-3 hover:text-chalk"
          >
            <Download size={14} />
            {t("selfService.designations.calendar")}
          </a>
        }
      />
      <Segmented
        className="mb-3"
        value={view}
        onChange={setView}
        options={(["upcoming", "declined", "all"] as const).map((v) => ({ value: v, label: t(`selfService.designations.views.${v}`, { n: counts[v] }) }))}
      />
      {rows.length === 0 ? (
        <Nothing>{t(view === "declined" ? "selfService.designations.noneDeclined" : view === "upcoming" ? "me.nothing" : "selfService.designations.none")}</Nothing>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((d) => (
            <li key={`${d.fixtureId}:${d.role}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-chalk">
                  {d.home} – {d.away}
                </p>
                <p className="text-xs text-chalk-dim">
                  {t(`roles.${d.role}` as TKey)} · {fmt.longDate(d.date)} · {d.kickoff} · {d.competition}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={d.played ? "neutral" : DESIGNATION_TONE[d.state]}>{d.played ? t("selfService.designations.played") : t(STATE_KEY[d.state])}</Badge>
                {hasConvocation(d) && (
                  <Link
                    href={`/me/convocation?fixture=${encodeURIComponent(d.fixtureId)}`}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-field bg-ink-2 px-3 py-1.5 text-xs font-medium text-chalk-dim hover:bg-ink-3 hover:text-chalk sm:min-h-0"
                  >
                    <FileText size={14} />
                    {t("selfService.convocation.open")}
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
