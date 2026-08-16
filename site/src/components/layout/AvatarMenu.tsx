"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  LogOut,
  Settings,
  ShieldCheck,
  UserCircle,
  Building2,
  Bell,
} from "lucide-react";

const menuItems = [
  { label: "My profile", icon: UserCircle },
  { label: "Federation settings", icon: Building2 },
  { label: "Notifications", icon: Bell, badge: "3" },
  { label: "Security & 2FA", icon: ShieldCheck },
  { label: "Preferences", icon: Settings },
];

export function AvatarMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
        className="flex items-center gap-2 rounded-full border border-aris-border bg-aris-surface pl-1 pr-2.5 py-1 hover:border-aris-emerald/50 transition-colors"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-aris-emerald to-aris-emerald-dark text-[11px] font-semibold text-[#04140c]">
          PS
        </span>
        <span className="hidden sm:flex flex-col items-start leading-tight">
          <span className="text-xs font-medium text-aris-text">Prestige Solutions</span>
          <span className="text-[10px] text-aris-muted">CAF Admin</span>
        </span>
        <ChevronDown size={14} className={`text-aris-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl border border-aris-border bg-aris-surface-2 glass shadow-2xl shadow-black/40 overflow-hidden z-50">
          <div className="p-3 border-b border-aris-border-soft">
            <p className="text-sm font-medium text-aris-text">Amina Koné</p>
            <p className="text-xs text-aris-muted">amina.kone@caf-demo.org</p>
            <span className="mt-2 inline-block rounded-full bg-aris-emerald/10 text-aris-emerald-light text-[10px] px-2 py-0.5 border border-aris-emerald/30">
              CAF Elite · Demo Account
            </span>
          </div>
          <div className="py-1">
            {menuItems.map((item) => (
              <button
                key={item.label}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm text-aris-muted hover:bg-white/5 hover:text-aris-text transition-colors"
              >
                <span className="flex items-center gap-2">
                  <item.icon size={15} />
                  {item.label}
                </span>
                {item.badge && (
                  <span className="rounded-full bg-aris-red/20 text-aris-red text-[10px] px-1.5 py-0.5">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="border-t border-aris-border-soft py-1">
            <button className="flex w-full items-center gap-2 px-3 py-2 text-sm text-aris-red hover:bg-aris-red/10 transition-colors">
              <LogOut size={15} />
              Sign out (demo)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
