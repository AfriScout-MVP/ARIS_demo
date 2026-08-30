"use client";

import { useT, type TKey } from "@/lib/i18n/LocaleProvider";

/**
 * The topbar carries the page title from `md` up. Below that it is taken by the
 * scope control, so the title reappears here — never in both places at once.
 */
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
    <div className="mb-4 flex items-start justify-between gap-3 md:hidden">
      <div className="min-w-0">
        <h1 className="font-display text-[19px] font-semibold text-chalk">{t(titleKey)}</h1>
        {subtitleKey && <p className="mt-0.5 text-[12.5px] leading-snug text-chalk-faint">{t(subtitleKey)}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
