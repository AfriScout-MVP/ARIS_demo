"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { notifications as seed, type Notification } from "@/lib/mock-data";
import { Dot, type Tone } from "@/components/ui";

export function NotificationsMenu() {
  const t = useT();
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>(seed);
  const ref = useRef<HTMLDivElement>(null);
  const unread = items.filter((n) => !n.read).length;

  useEffect(() => {
    function onPointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={t("common.notifications")}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-field bg-ink-3 text-chalk-dim transition-colors hover:bg-ink-4 hover:text-chalk"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute -right-12 z-50 mt-2 w-[min(320px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-line bg-ink-2 shadow-xl shadow-black/20 lg:right-0">
          <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
            <p className="text-sm font-medium text-chalk">{t("common.notifications")}</p>
            {unread > 0 && (
              <button
                onClick={() => setItems((prev) => prev.map((n) => ({ ...n, read: true })))}
                className="text-xs text-chalk-faint hover:text-chalk"
              >
                {t("common.markAllRead")}
              </button>
            )}
          </div>

          <div className="max-h-[380px] overflow-y-auto">
            {items.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-chalk-faint">{t("common.noNotifications")}</p>
            )}
            {items.map((n) => (
              <Link
                key={n.id}
                href={n.href}
                onClick={() => {
                  setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
                  setOpen(false);
                }}
                className={cn(
                  "flex gap-2.5 border-b border-line px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-red-500/10",
                  !n.read && "bg-wash/[0.04]",
                )}
              >
                <span className="mt-1.5">
                  <Dot tone={n.tone as Tone} />
                </span>
                <span className="min-w-0">
                  <span className={cn("block text-xs", n.read ? "text-chalk-dim" : "font-medium text-chalk")}>
                    {n.title[locale]}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-chalk-faint">{n.detail[locale]}</span>
                  <span className="mt-1 block text-[10.5px] text-chalk-faint">{n.time[locale]}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
