"use client";

import type { TKey } from "@/lib/i18n/LocaleProvider";
import { PageHeading } from "@/components/layout/PageHeading";
import { AdminNav } from "./AdminNav";

/** Heading, the admin section links, then the page. */
export function AdminPage({
  titleKey,
  subtitleKey,
  action,
  children,
}: {
  titleKey: TKey;
  subtitleKey?: TKey;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeading titleKey={titleKey} subtitleKey={subtitleKey} action={action} />
      <AdminNav />
      {children}
    </div>
  );
}
