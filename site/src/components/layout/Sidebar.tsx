"use client";

/**
 * Sidebar — AfriScout's admin sidebar, with ARIS's navigation in it.
 *
 * w-64, fixed. On desktop the X hides it completely (the top bar then carries
 * a button to bring it back); below `lg` it is a drawer over a dimmed page.
 * Groups are collapsible bordered headers; the group holding the current page
 * opens by itself.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LogOut, Moon, Sun, X } from "@/components/icons/glyphs";
import { cn } from "@/lib/utils";
import { useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { useTheme } from "@/lib/theme/ThemeProvider";
import { useDataset } from "@/lib/dataset/DatasetProvider";
import { navGroupsFor, type NavItem } from "./nav-items";
import { countryName } from "@/lib/store";
import { isFederation } from "@/lib/roles";
import { LocaleToggle } from "./LocaleToggle";
import { MarkTile } from "@/components/icons/Mark";

const isActive = (pathname: string, item: NavItem) =>
  item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);

export function Sidebar({
  desktopOpen,
  mobileOpen,
  onToggleDesktop,
  onCloseMobile,
}: {
  desktopOpen: boolean;
  mobileOpen: boolean;
  onToggleDesktop: () => void;
  onCloseMobile: () => void;
}) {
  const pathname = usePathname();
  const t = useT();
  const { user, signOut } = useDataset();
  const { locale } = useLocale();
  const { theme, toggle } = useTheme();
  // the first entry of the first group stands alone above the groups, as "Dashboard" does in the admin
  const [topItem, groups] = useMemo(() => {
    const visible = navGroupsFor(user?.role);
    if (visible.length === 0) return [undefined, []] as const;
    const [first, ...rest] = visible;
    const [top, ...firstRest] = first.items;
    return [top, [{ ...first, items: firstRest }, ...rest].filter((g) => g.items.length > 0)] as const;
  }, [user?.role]);
  // Only the groups the visitor has opened or closed by hand are stored; the
  // rest follow the page — a group is open while it holds the current route.
  const [manual, setManual] = useState<Record<string, boolean>>({});

  const renderItem = (item: NavItem) => {
    const active = isActive(pathname, item);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onCloseMobile}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group flex items-center gap-3 rounded-r-lg border-l-[3px] px-3 py-2.5 transition-colors",
          active
            ? "border-red-500 bg-red-500/[0.07] font-semibold text-chalk"
            : "border-transparent text-chalk-faint hover:border-line-strong hover:bg-wash/[0.04] hover:text-chalk",
        )}
      >
        <item.icon className={cn("h-5 w-5 shrink-0 transition-colors", active && "text-red-500")} />
        <span className="min-w-0 flex-1 font-medium leading-snug">{t(item.labelKey)}</span>
      </Link>
    );
  };

  const themeLabel = theme === "dark" ? t("nav.lightMode") : t("nav.darkMode");

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && <div className="fixed inset-0 z-[45] bg-black/50 lg:hidden" onClick={onCloseMobile} />}

      <aside
        className={cn(
          "fixed bottom-0 left-0 top-0 z-50 flex w-64 -translate-x-full flex-col border-r border-line bg-ink-1 transition-transform duration-300",
          mobileOpen && "translate-x-0",
          desktopOpen ? "lg:translate-x-0" : "lg:-translate-x-full",
        )}
      >
        {/* Identity header */}
        <div className="relative shrink-0 border-b border-line px-4 pb-4 pt-5">
          <button
            onClick={onToggleDesktop}
            className="absolute right-3 top-4 hidden h-8 w-8 items-center justify-center rounded-md bg-ink-2 transition-colors hover:bg-ink-4 dark:bg-ink-3 lg:flex"
            title={t("nav.closeSidebar")}
            aria-label={t("nav.closeSidebar")}
          >
            <X className="h-4 w-4 text-chalk-dim" aria-hidden="true" />
          </button>
          <button
            onClick={onCloseMobile}
            className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-lg bg-ink-2 transition-colors hover:bg-ink-4 dark:bg-ink-3 lg:hidden"
            title={t("common.close")}
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4 text-chalk-dim" aria-hidden="true" />
          </button>

          <div className="flex items-center gap-3 pr-10">
            <MarkTile size={44} />
            <div className="min-w-0">
              <p className="font-display truncate text-[22px] font-extrabold leading-none tracking-[-0.04em] text-chalk">ARIS</p>
              <p className="mt-1 truncate text-xs text-chalk-dim">
                {isFederation(user) && user?.federationCode && user.country
                  ? `${user.federationCode} · ${countryName(user.country, locale)}`
                  : t("nav.role")}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {topItem && renderItem(topItem)}

          {groups.map((group) => {
            const hasActive = group.items.some((item) => isActive(pathname, item));
            const open = manual[group.labelKey] ?? hasActive;
            return (
              <div key={group.labelKey} className="pt-2">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setManual((prev) => ({ ...prev, [group.labelKey]: !open }))}
                  className={cn(
                    "flex min-h-10 w-full items-center gap-2 px-3 py-2 transition-colors lg:min-h-0",
                    hasActive ? "text-chalk" : "text-chalk-faint hover:text-chalk",
                  )}
                >
                  <span className="eyebrow flex-1 text-left !text-inherit">{t(group.labelKey)}</span>
                  {hasActive && !open && <span className="h-1.5 w-1.5 shrink-0 rotate-45 bg-red-500" />}
                  <ChevronDown
                    className={cn("h-3.5 w-3.5 shrink-0 transition-transform", !open && "-rotate-90")}
                  />
                </button>
                {open && <div className="mt-0.5 space-y-0.5">{group.items.map(renderItem)}</div>}
              </div>
            );
          })}
        </nav>

        {/* Footer controls: theme + language + sign out */}
        <div className="shrink-0 space-y-1 border-t border-line px-3 pb-4 pt-3">
          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              className="flex flex-1 items-center gap-2 rounded-lg px-3 py-2.5 text-chalk-dim transition-all hover:bg-ink-3 hover:text-chalk"
              title={themeLabel}
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4 shrink-0 text-amber-400" />
              ) : (
                <Moon className="h-4 w-4 shrink-0" />
              )}
              <span className="truncate text-sm font-medium">{themeLabel}</span>
            </button>
            <LocaleToggle />
          </div>

          <button
            onClick={() => void signOut()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-red-700 transition-all hover:bg-red-500/10 dark:text-red-400"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span className="whitespace-nowrap text-sm font-medium">{t("common.signOut")}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
