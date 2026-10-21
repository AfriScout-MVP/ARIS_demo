"use client";

import { Menu, Moon, PanelLeftOpen, Search, Sun } from "@/components/icons/glyphs";
import { useT } from "@/lib/i18n/LocaleProvider";
import { useTheme } from "@/lib/theme/ThemeProvider";
import { ScopeSelect } from "./ScopeSelect";
import { NotificationsMenu } from "./NotificationsMenu";
import { AvatarMenu } from "./AvatarMenu";
import { MarkTile } from "@/components/icons/Mark";

/** AfriScout's admin icon button: 40px, rounded-[10px], bordered, tinted. */
export const iconButton =
  "flex h-10 w-10 items-center justify-center rounded-lg border border-field bg-ink-3 text-chalk-dim transition-colors hover:bg-ink-4 hover:text-chalk";

/**
 * Two bars, one at a time.
 *  - below `lg`: AfriScout's AdminHeader — fixed, h-16, menu + brand on the left,
 *    theme / search / alerts / avatar on the right. Scope sits under it.
 *  - from `lg`: the admin has no top bar, but ARIS's scope, search and alerts
 *    need a home, so they get a slim sticky bar in the same surface colours.
 */
export function Topbar({
  onOpenPalette,
  onOpenMobileNav,
  desktopOpen,
  onOpenDesktop,
}: {
  onOpenPalette: () => void;
  onOpenMobileNav: () => void;
  desktopOpen: boolean;
  onOpenDesktop: () => void;
}) {
  const t = useT();
  const { theme, toggle } = useTheme();
  const themeLabel = theme === "dark" ? t("nav.lightMode") : t("nav.darkMode");

  return (
    <>
      <header className="fixed left-0 right-0 top-0 z-40 flex h-16 items-center justify-between border-b border-line bg-ink-1 px-4 lg:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={onOpenMobileNav} aria-label={t("common.menu")} className={iconButton}>
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="flex items-center gap-2">
            <MarkTile size={32} />
            <span className="font-display text-xl font-extrabold tracking-[-0.04em] text-chalk">ARIS</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={toggle} className={iconButton} title={themeLabel} aria-label={themeLabel}>
            {theme === "dark" ? (
              <Sun className="h-5 w-5 text-amber-400" aria-hidden="true" />
            ) : (
              <Moon className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
          <button onClick={onOpenPalette} aria-label={t("common.search")} className={`${iconButton} max-[380px]:hidden`}>
            <Search className="h-5 w-5" aria-hidden="true" />
          </button>
          <NotificationsMenu />
          <AvatarMenu />
        </div>
      </header>

      <div className="sticky top-0 z-30 hidden h-16 items-center gap-3 border-b border-line bg-ink-0/85 px-6 backdrop-blur-md lg:flex">
        {!desktopOpen && (
          <button onClick={onOpenDesktop} className={iconButton} title={t("nav.openSidebar")} aria-label={t("nav.openSidebar")}>
            <PanelLeftOpen className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
        <ScopeSelect />

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onOpenPalette}
            className="flex h-10 items-center gap-2 rounded-lg border border-field bg-ink-2 pl-3 pr-2 text-sm text-chalk-faint transition-colors hover:border-red-500/50 hover:text-chalk-dim"
          >
            <Search className="h-4 w-4" />
            <span className="w-32 text-left xl:w-44">{t("common.search")}</span>
            <kbd className="rounded-[4px] border border-line px-1.5 py-0.5 text-[10px]">⌘K</kbd>
          </button>


          <NotificationsMenu />
          <AvatarMenu />
        </div>
      </div>
    </>
  );
}
