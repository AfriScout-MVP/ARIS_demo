"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, ShieldAlert, Trophy, BadgeCheck, ClipboardCheck } from "lucide-react";
import { notifications as initialNotifications, type Notification } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const toneIcon: Record<Notification["tone"], React.ComponentType<{ size?: number; className?: string }>> = {
  emerald: Trophy,
  gold: BadgeCheck,
  red: ShieldAlert,
  blue: ClipboardCheck,
};

const toneClasses: Record<Notification["tone"], string> = {
  emerald: "bg-aris-emerald/10 text-aris-emerald-light",
  gold: "bg-aris-gold/10 text-aris-gold",
  red: "bg-aris-red/10 text-aris-red",
  blue: "bg-aris-blue/10 text-blue-300",
};

export function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>(initialNotifications);
  const ref = useRef<HTMLDivElement>(null);
  const unread = items.filter((n) => !n.read).length;

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-aris-border bg-aris-surface text-aris-muted hover:text-aris-text transition-colors"
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-aris-red text-[9px] flex items-center justify-center text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-xl border border-aris-border bg-aris-surface-2 glass shadow-2xl shadow-black/40 overflow-hidden z-50">
          <div className="flex items-center justify-between p-3 border-b border-aris-border-soft">
            <p className="text-sm font-medium text-aris-text">Notifications</p>
            {unread > 0 && (
              <button
                onClick={() => setItems((prev) => prev.map((n) => ({ ...n, read: true })))}
                className="text-xs text-aris-emerald-light hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto py-1">
            {items.map((n) => {
              const Icon = toneIcon[n.tone];
              return (
                <button
                  key={n.id}
                  onClick={() => setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)))}
                  className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-white/5 transition-colors"
                >
                  <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", toneClasses[n.tone])}>
                    <Icon size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm truncate", n.read ? "text-aris-muted" : "text-aris-text font-medium")}>{n.title}</p>
                    <p className="text-xs text-aris-muted mt-0.5 line-clamp-2">{n.detail}</p>
                    <p className="text-[10px] text-aris-muted-2 mt-1">{n.time}</p>
                  </div>
                  {!n.read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-aris-emerald" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
