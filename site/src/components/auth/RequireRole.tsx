"use client";

import Link from "next/link";
import { ShieldAlert } from "@/components/icons/glyphs";
import { Card } from "@/components/ui";
import { Skeleton } from "@/components/admin/states";
import { toActor } from "@/lib/admin/actor";
import type { AdminRole } from "@/lib/admin/constants";
import { useDataset } from "@/lib/dataset/DatasetProvider";
import { useT } from "@/lib/i18n/LocaleProvider";
import { useMemo } from "react";

/**
 * Renders `children` only for the listed roles. For anybody else it shows a translated "not allowed" panel and,
 * because the children are never mounted, none of their requests are sent.
 */
export function RequireRole({ roles, children }: { roles: AdminRole[]; children: React.ReactNode }) {
  const t = useT();
  const { user } = useDataset();
  const actor = useMemo(() => toActor(user), [user]);

  if (!actor) {
    return (
      <div className="space-y-3" aria-busy>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (actor.role && roles.includes(actor.role)) return <>{children}</>;

  return (
    <Card tint="amber" className="mx-auto max-w-xl">
      <div role="alert" className="flex flex-col items-center gap-3 px-2 py-6 text-center">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-amber-500/15 text-amber">
          <ShieldAlert size={22} />
        </span>
        <h2 className="text-lg font-semibold text-chalk">{t("admin.forbidden.title")}</h2>
        <p className="max-w-md text-sm leading-relaxed text-chalk-dim">{t("admin.forbidden.body")}</p>
        <Link
          href="/"
          className="inline-flex min-h-10 items-center rounded-lg border border-field bg-ink-2 px-4 py-2 text-sm font-medium text-chalk-dim hover:bg-ink-3 hover:text-chalk"
        >
          {t("admin.forbidden.home")}
        </Link>
      </div>
    </Card>
  );
}
