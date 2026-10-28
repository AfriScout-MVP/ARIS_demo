"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Banknote } from "@/components/icons/glyphs";
import { Card, CardHeader, EmptyState } from "@/components/ui";
import { PageHeading } from "@/components/layout/PageHeading";
import { getPaymentSlip } from "@/lib/api/me";
import { MONEY } from "@/lib/finance/rules";
import { useResource } from "@/lib/admin/hooks";
import { useFormatters, useT, type TKey } from "@/lib/i18n/LocaleProvider";
import { CardError, CardSkeleton } from "@/components/me/CardStates";

function BackLink() {
  const t = useT();
  return (
    <Link href="/me" className="inline-flex items-center gap-1.5 text-xs text-chalk-faint hover:text-chalk">
      <ArrowLeft size={14} />
      {t("selfService.slip.back")}
    </Link>
  );
}

function SlipFromQuery() {
  const t = useT();
  const fmt = useFormatters();
  const paymentId = useSearchParams().get("payment");
  const slip = useResource(`me:slip|${paymentId}`, (signal) => getPaymentSlip(paymentId!, signal), !!paymentId);

  if (!paymentId) {
    return (
      <Card>
        <EmptyState title={t("selfService.slip.notFound")} />
      </Card>
    );
  }
  if (slip.loading) return <CardSkeleton title={t("selfService.slip.title")} rows={6} />;
  if (slip.error || !slip.data) return <CardError title={t("selfService.slip.title")} error={slip.error} onRetry={slip.reload} />;
  const s = slip.data;
  const rows: Array<[string, number]> = [["base", s.base], ...MONEY.map((k): [string, number] => [k, s[k]]), ["total", s.total]];

  return (
    <Card>
      <CardHeader
        title={t("selfService.slip.title")}
        subtitle={`${s.home}, ${s.away} · ${fmt.longDate(s.date)} · ${s.kickoff}`}
        icon={Banknote}
        tint="gold"
      />
      <div className="space-y-4">
        <div>
          <p className="text-sm text-chalk-dim">{s.competition}</p>
          <p className="text-sm text-chalk-dim">
            {t("selfService.slip.official")}: {s.officialName}
            {s.matricule ? ` · ${s.matricule}` : ""}
          </p>
          {s.payer && (
            <p className="text-sm text-chalk-dim">
              {t("selfService.slip.payer")}: {s.payer.name}
            </p>
          )}
        </div>

        <dl className="divide-y divide-line rounded-lg border border-line text-sm">
          {rows.map(([key, value]) => (
            <div key={key} className={key === "total" ? "flex items-center justify-between bg-ink-3 px-3 py-2 font-semibold" : "flex items-center justify-between px-3 py-2"}>
              <dt className="text-chalk-dim">{t(`finance.money.${key}` as TKey)}</dt>
              <dd className="text-chalk">
                {key === "deduction" && value > 0 ? "− " : ""}
                {fmt.number(value)} {s.currency}
              </dd>
            </div>
          ))}
        </dl>

        <p className="text-xs text-chalk-faint">{t("finance.panel.paidOn", { date: fmt.date(s.paidAt.slice(0, 10)), ref: s.paymentRef ?? "" })}</p>
      </div>
    </Card>
  );
}

export default function SlipPage() {
  return (
    <>
      <PageHeading titleKey="selfService.slip.title" />
      <BackLink />
      <div className="mt-3">
        <Suspense fallback={null}>
          <SlipFromQuery />
        </Suspense>
      </div>
    </>
  );
}
