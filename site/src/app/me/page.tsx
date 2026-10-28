"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Banknote, FileText, Trophy } from "@/components/icons/glyphs";
import { Badge, Button, Card, CardHeader, EmptyState, type Tone } from "@/components/ui";
import { TextField } from "@/components/admin/fields";
import { PageHeading } from "@/components/layout/PageHeading";
import { MyAdvances } from "@/components/finance/MyAdvances";
import { MyCases } from "@/components/discipline/MyCases";
import { MyFile } from "@/components/officials/MyFile";
import { MyAssessments } from "@/components/assessments/MyAssessments";
import { AwaitingCard, DesignationsCard } from "@/components/me/DesignationCards";
import { AvailabilityCard } from "@/components/me/AvailabilityCard";
import { EarningsCard } from "@/components/me/EarningsCard";
import { api, ApiError, NetworkError } from "@/lib/api/client";
import { listMyDesignations } from "@/lib/api/me";
import { useResource } from "@/lib/admin/hooks";
import { useDataset } from "@/lib/dataset/DatasetProvider";
import { useFormatters, useT, type TKey } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";

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

export default function MySpacePage() {
  const t = useT();
  const fmt = useFormatters();
  const toast = useToast();
  const { user, noteFailure } = useDataset();
  const officialId = user?.officialId ?? null;

  const designations = useResource(`me:designations|${officialId}`, (signal) => listMyDesignations({}, signal), !!officialId);

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
      const [p, h] = await Promise.all([api<{ payments: Payment[] }>("/payments"), api<{ matches: PlayedMatch[] }>("/me/history")]);
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

  return (
    <>
      <PageHeading titleKey="me.title" subtitleKey="me.subtitle" />

      <AwaitingCard designations={designations} />

      <DesignationsCard designations={designations} />

      <AvailabilityCard officialId={officialId} />

      <EarningsCard />

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
                      {p.home}, {p.away}
                    </p>
                    <p className="text-xs text-chalk-dim">
                      {fmt.date(p.date)} · {fmt.number(p.total)} {p.currency}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={statusTone[p.status]}>{t(`me.status.${p.status}` as TKey)}</Badge>
                    {p.status === "paid" && (
                      <Link
                        href={`/me/slip?payment=${encodeURIComponent(p.id)}`}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-field bg-ink-2 px-3 py-1.5 text-xs font-medium text-chalk-dim hover:bg-ink-3 hover:text-chalk sm:min-h-0"
                      >
                        <FileText size={14} />
                        {t("selfService.slip.open")}
                      </Link>
                    )}
                    {(p.status === "due" || p.status === "validated") && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setContesting(contesting === p.id ? null : p.id)}
                        aria-expanded={contesting === p.id}
                      >
                        {t("me.contest")}
                      </Button>
                    )}
                  </div>
                </div>
                {contesting === p.id && (
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                    <TextField
                      className="flex-1"
                      label={t("me.contestWhy")}
                      value={contestNote}
                      onChange={setContestNote}
                    />
                    <Button
                      type="button"
                      variant="primary"
                      disabled={contestNote.trim().length < 5}
                      onClick={() => void contest(p)}
                    >
                      {t("me.send")}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <MyAssessments officialId={officialId} />

      <MyFile officialId={officialId} />

      <MyCases />

      <MyAdvances
        trips={(designations.data ?? [])
          .filter((d) => d.state === "confirmed" && !d.played)
          .map((d) => ({ fixtureId: d.fixtureId, label: `${fmt.date(d.date)} · ${d.home}, ${d.away}` }))}
      />

      <Card>
        <CardHeader title={t("me.history")} icon={Trophy} tint="slate" />
        {!loaded ? null : history.length === 0 ? (
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
