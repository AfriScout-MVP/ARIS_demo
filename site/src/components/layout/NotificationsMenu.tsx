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
        className="relative rounded-md border border-line bg-ink-2 p-1.5 text-chalk-dim transition-colors hover:border-line-strong hover:text-chalk"
      >
        <Bell size={15} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-card-red px-1 text-[9px] font-semibold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[320px] overflow-hidden rounded-lg border border-line bg-ink-2 shadow-2xl shadow-black/60">
          <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
            <p className="text-[13px] font-medium text-chalk">{t("common.notifications")}</p>
            {unread > 0 && (
              <button
                onClick={() => setItems((prev) => prev.map((n) => ({ ...n, read: true })))}
                className="text-[11.5px] text-chalk-faint hover:text-chalk"
              >
                {t("common.markAllRead")}
              </button>
            )}
          </div>

          <div className="max-h-[380px] overflow-y-auto">
            {items.length === 0 && (
              <p className="px-3 py-6 text-center text-[12.5px] text-chalk-faint">{t("common.noNotifications")}</p>
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
                  "flex gap-2.5 border-b border-line px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-white/[0.04]",
                  !n.read && "bg-white/[0.02]",
                )}
              >
                <span className="mt-1.5">
                  <Dot tone={n.tone as Tone} />
                </span>
                <span className="min-w-0">
                  <span className={cn("block text-[12.5px]", n.read ? "text-chalk-dim" : "font-medium text-chalk")}>
                    {n.title[locale]}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-chalk-faint">{n.detail[locale]}</span>
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
