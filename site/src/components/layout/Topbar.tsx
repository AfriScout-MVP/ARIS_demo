"use client";

import { usePathname } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { useT } from "@/lib/i18n/LocaleProvider";
import { ScopeSelect } from "./ScopeSelect";
import { LocaleToggle } from "./LocaleToggle";
import { NotificationsMenu } from "./NotificationsMenu";
import { AvatarMenu } from "./AvatarMenu";
import { navItemFor } from "./nav-items";
import { Dot } from "@/components/ui";

export function Topbar({
  onOpenPalette,
  onOpenDrawer,
}: {
  onOpenPalette: () => void;
  onOpenDrawer: () => void;
}) {
  const pathname = usePathname();
  const t = useT();
  const item = navItemFor(pathname);
  const isProfile = pathname.startsWith("/referees/") && pathname !== "/referees";

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink-0/85 backdrop-blur-md">
      <div className="flex items-center gap-2 px-3 py-2.5 sm:px-5 sm:gap-3">
        <button
          onClick={onOpenDrawer}
          aria-label={t("common.menu")}
          className="rounded-md p-1.5 text-chalk-dim hover:bg-white/5 hover:text-chalk lg:hidden"
        >
          <Menu size={19} />
        </button>

        <div className="min-w-0 flex-1 sm:flex-none">
          <ScopeSelect />
        </div>

        <div className="ml-1 hidden min-w-0 flex-1 md:block">
          <h1 className="truncate font-display text-[15px] font-semibold text-chalk">
            {isProfile ? t("referees.title") : item ? t(item.labelKey) : "ARIS"}
          </h1>
          {item && !isProfile && (
            <p className="truncate text-[11.5px] text-chalk-faint">{t(item.subtitleKey)}</p>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            onClick={onOpenPalette}
            className="hidden items-center gap-2 rounded-md border border-line bg-ink-2 py-1.5 pl-2.5 pr-2 text-[12.5px] text-chalk-faint transition-colors hover:border-line-strong hover:text-chalk-dim sm:flex"
          >
            <Search size={13} />
            <span className="w-28 text-left lg:w-40">{t("common.search")}</span>
            <kbd className="rounded border border-line px-1 py-0.5 text-[10px]">⌘K</kbd>
          </button>
          <button
            onClick={onOpenPalette}
            aria-label={t("common.search")}
            className="rounded-md p-1.5 text-chalk-dim hover:bg-white/5 hover:text-chalk sm:hidden"
          >
            <Search size={18} />
          </button>

          <span className="hidden items-center gap-1.5 rounded-md border border-line bg-ink-2 px-2 py-1 text-[11px] text-chalk-faint xl:inline-flex">
            <Dot tone="pitch" pulse />
            {t("common.demoData")}
          </span>

          <LocaleToggle />
          <NotificationsMenu />
          <AvatarMenu />
        </div>
      </div>
    </header>
  );
}
