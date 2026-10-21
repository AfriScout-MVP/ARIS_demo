"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, Banknote, CalendarOff, Check, Trophy, X } from "@/components/icons/glyphs";
import { Badge, Button, Card, CardHeader, EmptyState, type Tone } from "@/components/ui";
import { PageHeading } from "@/components/layout/PageHeading";
import { api, ApiError, NetworkError } from "@/lib/api/client";
import { useDataset } from "@/lib/dataset/DatasetProvider";
import { useFormatters, useT, type TKey } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";
import type { CrewRole } from "@/lib/core/types";

interface Designation {
  fixtureId: string;
  role: CrewRole;
  state: "pending" | "confirmed" | "declined";
  home: string;
  away: string;
  date: string;
  kickoff: string;
  venue: string;
  city: string;
  played: number;
}

interface Payment {
  id: string;
  role: string;
  total: number;
  currency: string;
  status: "due" | "validated" | "paid" | "contested" | "cancelled";
  home: string;
  away: string;
  date: string;
}

interface PlayedMatch {
  id: string;
  date: string;
  home: string;
  away: string;
  score: string;
  role: string;
}

const statusTone: Record<Payment["status"], Tone> = {
  due: "amber",
  validated: "var",
  paid: "pitch",
  contested: "red",
  cancelled: "neutral",
};

const field =
  "h-10 w-full rounded-[10px] border border-field bg-ink-2 px-3 text-sm text-chalk placeholder:text-chalk-faint focus:border-red-500/60 focus:outline-none";

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function datesBetween(from: string, to: string) {
  const out: string[] = [];
  const end = new Date(`${to}T12:00:00Z`);
  for (let d = new Date(`${from}T12:00:00Z`); d <= end && out.length < 62; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export default function MySpacePage() {
  const t = useT();
  const fmt = useFormatters();
  const toast = useToast();
  const { user, noteFailure } = useDataset();
  const officialId = user?.officialId ?? null;

  const [designations, setDesignations] = useState<Designation[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [history, setHistory] = useState<PlayedMatch[]>([]);
  const [loaded, setLoaded] = useState(false);

  const fail = useCallback(
    (err: unknown) => {
      noteFailure(err);
      if (err instanceof NetworkError) toast.push("error", t("live.offline"));
      else if (err instanceof ApiError && err.status === 403) toast.push("error", t("live.forbidden"));
      else if (err instanceof ApiError && err.code === "stale") toast.push("error", t("live.stale"));
      else toast.push("error", t("live.notSaved"));
    },
    [noteFailure, toast, t],
  );

  const refresh = useCallback(async () => {
    try {
      const [d, p, h] = await Promise.all([
        api<{ designations: Designation[] }>("/me/designations"),
        api<{ payments: Payment[] }>("/payments"),
        api<{ matches: PlayedMatch[] }>("/me/history"),
      ]);
      setDesignations(d.designations);
      setPayments(p.payments);
      setHistory(h.matches);
    } catch (err) {
      noteFailure(err);
    } finally {
      setLoaded(true);
    }
  }, [noteFailure]);

  useEffect(() => {
    if (!officialId) return;
    // load once the session is known
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [officialId, refresh]);

  /* ---- answering a designation ---- */
  const [declining, setDeclining] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("");

  async function respond(d: Designation, response: "accept" | "decline") {
    try {
      await api(`/fixtures/${encodeURIComponent(d.fixtureId)}/designations/${d.role}/respond`, {
        method: "POST",
        body: { response, reason: response === "decline" ? declineReason.trim() : undefined },
      });
      toast.push("success", t("me.answered"));
      setDeclining(null);
      setDeclineReason("");
      await refresh();
    } catch (err) {
      fail(err);
    }
  }

  /* ---- declaring days off ---- */
  const [from, setFrom] = useState(isoToday());
  const [to, setTo] = useState(isoToday());
  const [state, setState] = useState<"unavailable" | "travelling" | "resting">("unavailable");
  const [reason, setReason] = useState<"leave" | "work" | "injury" | "other">("leave");

  async function declare(e: React.FormEvent) {
    e.preventDefault();
    if (!officialId) return;
    const dates = datesBetween(from, to);
    try {
      const res = await api<{ declared: number; conflicts: unknown[] }>(`/officials/${encodeURIComponent(officialId)}/availability`, {
        method: "PUT",
        body: { dates, state, reason: state === "unavailable" ? reason : undefined },
      });
      toast.push("success", t("me.declared", { n: res.declared }));
      if (res.conflicts.length) toast.push("error", t("me.clash", { n: res.conflicts.length }));
    } catch (err) {
      fail(err);
    }
  }

  /* ---- contesting an amount ---- */
  const [contesting, setContesting] = useState<string | null>(null);
  const [contestNote, setContestNote] = useState("");

  async function contest(p: Payment) {
    try {
      await api(`/payments/${encodeURIComponent(p.id)}/contest`, { method: "POST", body: { note: contestNote.trim() } });
      toast.push("success", t("me.contested"));
      setContesting(null);
      setContestNote("");
      await refresh();
    } catch (err) {
      fail(err);
    }
  }

  if (!officialId) {
    return (
      <>
        <PageHeading titleKey="me.title" subtitleKey="me.subtitle" />
        <EmptyState title={t("me.noOfficial")} />
      </>
    );
  }

  const awaiting = designations.filter((d) => d.state === "pending" && !d.played);
  const upcoming = designations.filter((d) => d.state !== "declined" && !d.played && d.state !== "pending");
  const stateLabel: Record<Designation["state"], TKey> = { pending: "me.pending", confirmed: "me.confirmed", declined: "me.declinedState" };

  return (
    <>
      <PageHeading titleKey="me.title" subtitleKey="me.subtitle" />

      <Card tint={awaiting.length ? "amber" : undefined}>
        <CardHeader title={t("me.awaiting")} icon={CalendarCheck} tint="amber" />
        {!loaded ? null : awaiting.length === 0 ? (
          <p className="text-sm text-chalk-dim">{t("me.nothingAwaiting")}</p>
        ) : (
          <ul className="space-y-3">
            {awaiting.map((d) => {
              const key = `${d.fixtureId}:${d.role}`;
              return (
                <li key={key} className="rounded-[10px] border border-line bg-ink-1 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-chalk">
                        {d.home} – {d.away}
                      </p>
                      <p className="mt-0.5 text-xs text-chalk-dim">
                        {t(`roles.${d.role}` as TKey)} · {fmt.longDate(d.date)} · {d.kickoff} · {d.venue}, {d.city}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="primary" size="sm" onClick={() => void respond(d, "accept")}>
                        <Check size={14} />
                        {t("me.accept")}
                      </Button>
                      <Button size="sm" onClick={() => setDeclining(declining === key ? null : key)} aria-expanded={declining === key}>
                        <X size={14} />
                        {t("me.decline")}
                      </Button>
                    </div>
                  </div>
                  {declining === key && (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <input
                        aria-label={t("me.declineWhy")}
                        placeholder={t("me.declineWhy")}
                        value={declineReason}
                        onChange={(e) => setDeclineReason(e.target.value)}
                        className={field}
                      />
                      <Button variant="danger" disabled={declineReason.trim().length < 3} onClick={() => void respond(d, "decline")}>
                        {t("me.send")}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title={t("me.upcoming")} icon={Trophy} tint="pitch" />
        {upcoming.length === 0 ? (
          <p className="text-sm text-chalk-dim">{t("me.nothing")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {upcoming.map((d) => (
              <li key={`${d.fixtureId}:${d.role}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-chalk">
                    {d.home} – {d.away}
                  </p>
                  <p className="text-xs text-chalk-dim">
                    {t(`roles.${d.role}` as TKey)} · {fmt.longDate(d.date)} · {d.kickoff}
                  </p>
                </div>
                <Badge tone="pitch">{t(stateLabel[d.state])}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title={t("me.availability")} icon={CalendarOff} tint="slate" />
        <form onSubmit={declare} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <label className="space-y-1.5 text-xs font-medium text-chalk-dim">
            {t("me.from")}
            <input type="date" required value={from} min={isoToday()} onChange={(e) => (setFrom(e.target.value), e.target.value > to && setTo(e.target.value))} className={field} />
          </label>
          <label className="space-y-1.5 text-xs font-medium text-chalk-dim">
            {t("me.to")}
            <input type="date" required value={to} min={from} onChange={(e) => setTo(e.target.value)} className={field} />
          </label>
          <label className="space-y-1.5 text-xs font-medium text-chalk-dim">
            {t("me.state")}
            <select value={state} onChange={(e) => setState(e.target.value as typeof state)} className={field}>
              <option value="unavailable">{t("me.stateUnavailable")}</option>
              <option value="travelling">{t("me.stateTravelling")}</option>
              <option value="resting">{t("me.stateResting")}</option>
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-medium text-chalk-dim">
            {t("me.reason")}
            <select value={reason} disabled={state !== "unavailable"} onChange={(e) => setReason(e.target.value as typeof reason)} className={`${field} disabled:opacity-40`}>
              <option value="leave">{t("me.reasonLeave")}</option>
              <option value="work">{t("me.reasonWork")}</option>
              <option value="injury">{t("me.reasonInjury")}</option>
              <option value="other">{t("me.reasonOther")}</option>
            </select>
          </label>
          <Button type="submit" variant="primary">
            {t("me.declare")}
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader title={t("me.payments")} icon={Banknote} tint="gold" />
        {payments.length === 0 ? (
          <p className="text-sm text-chalk-dim">{t("me.noPayments")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {payments.map((p) => (
              <li key={p.id} className="py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-chalk">
                      {p.home} – {p.away}
                    </p>
                    <p className="text-xs text-chalk-dim">
                      {fmt.date(p.date)} · {fmt.number(p.total)} {p.currency}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={statusTone[p.status]}>{t(`me.status.${p.status}` as TKey)}</Badge>
                    {(p.status === "due" || p.status === "validated") && (
                      <Button size="sm" onClick={() => setContesting(contesting === p.id ? null : p.id)} aria-expanded={contesting === p.id}>
                        {t("me.contest")}
                      </Button>
                    )}
                  </div>
                </div>
                {contesting === p.id && (
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      aria-label={t("me.contestWhy")}
                      placeholder={t("me.contestWhy")}
                      value={contestNote}
                      onChange={(e) => setContestNote(e.target.value)}
                      className={field}
                    />
                    <Button variant="danger" disabled={contestNote.trim().length < 5} onClick={() => void contest(p)}>
                      {t("me.send")}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title={t("me.history")} icon={Trophy} tint="slate" />
        {history.length === 0 ? (
          <p className="text-sm text-chalk-dim">{t("me.noHistory")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {history.slice(0, 20).map((m) => (
              <li key={`${m.id}:${m.role}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-chalk">
                    {m.home} {m.score} {m.away}
                  </p>
                  <p className="text-xs text-chalk-dim">
                    {t(`roles.${m.role}` as TKey)} · {fmt.longDate(m.date)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
