"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/LocaleProvider";
import { navGroups } from "./nav-items";
import { Mark } from "@/components/icons/Mark";

export function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const t = useT();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[55] lg:hidden">
      <button aria-label={t("common.close")} onClick={onClose} className="absolute inset-0 bg-ink-0/75 backdrop-blur-sm" />
      <div className="relative flex h-full w-[82%] max-w-[300px] flex-col border-r border-line bg-ink-1">
        <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
          <span className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-pitch text-[#04140c]">
              <Mark size={17} />
            </span>
            <span className="leading-tight">
              <span className="block font-display text-[13px] font-bold tracking-[0.12em] text-chalk">ARIS</span>
              <span className="block text-[10px] text-chalk-faint">{t("common.by")}</span>
            </span>
          </span>
          <button onClick={onClose} aria-label={t("common.close")} className="rounded-md p-1.5 text-chalk-dim hover:bg-white/5">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-3">
          {navGroups.map((group) => (
            <div key={group.labelKey} className="mb-4">
              <p className="px-2.5 pb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-chalk-faint">
                {t(group.labelKey)}
              </p>
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
                        onClick={onClose}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-[13.5px] transition-colors",
                          active ? "bg-pitch/12 text-pitch" : "text-chalk-dim hover:bg-white/[0.035]",
                        )}
                      >
                        <item.icon size={16} className={active ? "text-pitch" : "text-chalk-faint"} />
                        {t(item.labelKey)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </div>
  );
}
