"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, FileText, IdCard, MapPin, Users } from "@/components/icons/glyphs";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { PageHeading } from "@/components/layout/PageHeading";
import { getConvocation } from "@/lib/api/me";
import { useResource } from "@/lib/admin/hooks";
import { useFormatters, useT, type TKey } from "@/lib/i18n/LocaleProvider";
import { CardError, CardSkeleton } from "@/components/me/CardStates";

function BackLink() {
  const t = useT();
  return (
    <Link href="/me" className="inline-flex items-center gap-1.5 text-xs text-chalk-faint hover:text-chalk">
      <ArrowLeft size={14} />
      {t("selfService.convocation.back")}
    </Link>
  );
}

function ConvocationFromQuery() {
  const t = useT();
  const fmt = useFormatters();
  const fixtureId = useSearchParams().get("fixture");
  const convocation = useResource(`me:convocation|${fixtureId}`, (signal) => getConvocation(fixtureId!, signal), !!fixtureId);

  if (!fixtureId) {
    return (
      <Card>
        <EmptyState title={t("selfService.convocation.notFound")} />
      </Card>
    );
  }
  if (convocation.loading) return <CardSkeleton title={t("selfService.convocation.title")} rows={4} />;
  if (convocation.error || !convocation.data) {
    return <CardError title={t("selfService.convocation.title")} error={convocation.error} onRetry={convocation.reload} />;
  }
  const c = convocation.data;
  const where = [c.venue, c.city].filter(Boolean).join(", ");

  return (
    <Card>
      <CardHeader
        title={t("selfService.convocation.title")}
        subtitle={`${c.competition}${c.season ? ` · ${c.season}` : ""}${c.round != null ? ` · ${t("selfService.convocation.round", { round: c.round })}` : ""}`}
        icon={FileText}
        tint="pitch"
      />
      <div className="space-y-4">
        <div>
          <p className="text-base font-semibold text-chalk">
            {c.home}, {c.away}
          </p>
          <p className="mt-0.5 text-sm text-chalk-dim">
            {fmt.longDate(c.date)} · {c.kickoff} · {c.timezone}
          </p>
          {where && (
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-chalk-dim">
              <MapPin size={14} />
              {where}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-line bg-ink-1 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-chalk-dim">
            <IdCard size={14} />
            {t("selfService.convocation.official")}
          </p>
          <p className="mt-1 text-sm text-chalk">{c.official.name}</p>
          <p className="text-xs text-chalk-dim">
            {c.official.matricule && `${t("selfService.convocation.matricule")}: ${c.official.matricule}`}
            {c.official.matricule && c.official.licenceNo && " · "}
            {c.official.licenceNo && `${t("selfService.convocation.licenceNo")}: ${c.official.licenceNo}`}
          </p>
          <p className="mt-1 text-xs text-chalk-dim">{t(`roles.${c.role}` as TKey)}</p>
        </div>

        <div className="rounded-lg border border-line bg-ink-1 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-chalk-dim">
            <Users size={14} />
            {t("selfService.convocation.crew")}
          </p>
          <ul className="mt-1 space-y-1">
            {c.crew.map((member) => (
              <li key={`${member.role}:${member.name}`} className="flex items-center justify-between gap-2 text-sm text-chalk">
                <span>
                  {member.name} · {t(`roles.${member.role}` as TKey)}
                </span>
                {member.me && <Badge tone="pitch">{t("selfService.convocation.you")}</Badge>}
              </li>
            ))}
          </ul>
        </div>

        {c.issuer && (
          <p className="text-xs text-chalk-faint">
            {t("selfService.convocation.issuedBy")}: {c.issuer.name}
            {c.issuer.code ? ` (${c.issuer.code})` : ""}
          </p>
        )}
        {c.publishedAt && <p className="text-xs text-chalk-faint">{t("selfService.convocation.published", { date: fmt.longDate(c.publishedAt) })}</p>}
      </div>
    </Card>
  );
}

export default function ConvocationPage() {
  return (
    <>
      <PageHeading titleKey="selfService.convocation.title" />
      <BackLink />
      <div className="mt-3">
        <Suspense fallback={null}>
          <ConvocationFromQuery />
        </Suspense>
      </div>
    </>
  );
}
