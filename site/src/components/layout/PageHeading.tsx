"use client";

import { useT, type TKey } from "@/lib/i18n/LocaleProvider";

/** The admin's page header: a bold title with a fern subtitle, action on the right. */
export function PageHeading({
  titleKey,
  subtitleKey,
  action,
}: {
  titleKey: TKey;
  subtitleKey?: TKey;
  action?: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-chalk lg:text-3xl">{t(titleKey)}</h1>
        {subtitleKey && <p className="mt-1 text-chalk-dim">{t(subtitleKey)}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
