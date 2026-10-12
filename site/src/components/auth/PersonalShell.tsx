"use client";

import { LogOut } from "@/components/icons/glyphs";
import { MarkTile } from "@/components/icons/Mark";
import { LocaleToggle } from "@/components/layout/LocaleToggle";
import { NotificationsMenu } from "@/components/layout/NotificationsMenu";
import { useT } from "@/lib/i18n/LocaleProvider";
import { useDataset } from "@/lib/dataset/DatasetProvider";

/** The referee's frame: no commission navigation, just their own space. */
export function PersonalShell({ children }: { children: React.ReactNode }) {
  const t = useT();
  const { user, signOut } = useDataset();
  return (
    <div className="min-h-screen bg-ink-0">
      <header className="sticky top-0 z-30 border-b border-line bg-ink-1/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2.5 text-chalk">
            <MarkTile size={32} />
            <div className="min-w-0">
              <p className="font-display text-base font-extrabold leading-none tracking-[-0.03em]">{t("common.appName")}</p>
              <p className="mt-1 truncate text-[11px] leading-none text-chalk-faint">{user?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LocaleToggle />
            <NotificationsMenu />
            <button
              onClick={() => void signOut()}
              aria-label={t("common.signOut")}
              title={t("common.signOut")}
              className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-field bg-ink-3 text-chalk-dim transition-colors hover:bg-ink-4 hover:text-chalk"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl space-y-5 p-4 pb-16 lg:py-6">{children}</main>
    </div>
  );
}
