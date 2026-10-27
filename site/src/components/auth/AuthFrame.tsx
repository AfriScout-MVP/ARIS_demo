"use client";

import { MarkTile } from "@/components/icons/Mark";
import { LocaleToggle } from "@/components/layout/LocaleToggle";
import { useT } from "@/lib/i18n/LocaleProvider";

/** The signed-out frame shared by the recovery screens and the forced password change: the mark, the language, a card. */
export function AuthFrame({ children }: { children: React.ReactNode }) {
  const t = useT();
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="rise w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-chalk">
            <MarkTile size={40} />
            <div>
              <p className="font-display text-lg font-extrabold leading-none tracking-[-0.03em]">{t("common.appName")}</p>
              <p className="mt-1 text-[11px] leading-none text-chalk-faint">{t("common.by")}</p>
            </div>
          </div>
          <LocaleToggle />
        </div>
        <div className="panel space-y-4 rounded-[14px] border border-line bg-ink-1 p-5">{children}</div>
      </div>
    </main>
  );
}

/** The card's heading. */
export function AuthHeading({ icon, title, subtitle }: { icon?: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div>
      <h1 className="flex items-center gap-2 text-lg font-semibold text-chalk">
        {icon}
        {title}
      </h1>
      {subtitle && <p className="mt-1 text-sm text-chalk-dim">{subtitle}</p>}
    </div>
  );
}

/** A problem with the whole form, read out when it appears. */
export function AuthAlert({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
      {children}
    </p>
  );
}

export const authField =
  "h-11 w-full rounded-[10px] border border-field bg-ink-2 px-3 text-sm text-chalk placeholder:text-chalk-faint focus:border-red-500/60 focus:outline-none aria-[invalid=true]:border-red-500";
