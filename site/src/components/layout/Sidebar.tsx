"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePersistent, writeStore } from "@/lib/persistent-store";
import { useT } from "@/lib/i18n/LocaleProvider";
import { navGroups } from "./nav-items";
import { Mark } from "@/components/icons/Mark";

const STORAGE_KEY = "aris.sidebar";

const parseCollapsed = (raw: string | null) => raw === "1";

export function Sidebar() {
  const pathname = usePathname();
  const t = useT();
  const collapsed = usePersistent(STORAGE_KEY, parseCollapsed, false);

  function toggle() {
    writeStore(STORAGE_KEY, collapsed ? "0" : "1");
  }

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-ink-1 lg:flex",
        collapsed ? "w-[68px]" : "w-[252px]",
      )}
    >
      <div className={cn("flex items-center gap-2.5 px-4 py-4", collapsed && "justify-center px-0")}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-pitch text-[#04140c]">
          <Mark size={17} />
        </span>
        {!collapsed && (
          <span className="min-w-0 leading-tight">
            <span className="block font-display text-[13.5px] font-bold tracking-[0.12em] text-chalk">ARIS</span>
            <span className="block truncate text-[10.5px] text-chalk-faint">{t("common.appFull")}</span>
          </span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 pb-4">
        {navGroups.map((group) => (
          <div key={group.labelKey} className="mb-4">
            {!collapsed && (
              <p className="px-2.5 pb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-chalk-faint">
                {t(group.labelKey)}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? t(item.labelKey) : undefined}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors",
                        collapsed && "justify-center px-0",
                        active
                          ? "bg-pitch/12 text-pitch"
                          : "text-chalk-dim hover:bg-white/[0.035] hover:text-chalk",
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-pitch" />
                      )}
                      <item.icon size={16} className={active ? "text-pitch" : "text-chalk-faint"} />
                      {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-line p-2.5">
        <button
          onClick={toggle}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[12.5px] text-chalk-faint transition-colors hover:bg-white/[0.035] hover:text-chalk",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          {!collapsed && t("nav.collapse")}
        </button>
      </div>
    </aside>
  );
}
