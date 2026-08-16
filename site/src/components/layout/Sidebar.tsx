"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { navItems } from "./nav-items";
import { Whistle } from "@/components/icons/Whistle";
import { Home } from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-aris-border bg-aris-bg-2 px-4 py-5">
      <Link href="/" className="flex items-center gap-2 px-2 mb-8">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-aris-emerald to-aris-emerald-dark text-[#04140c]">
          <Whistle size={18} />
        </span>
        <div className="leading-tight">
          <p className="font-display font-bold text-aris-text text-sm tracking-wide">ARIS</p>
          <p className="text-[10px] text-aris-muted">Referee Intelligence</p>
        </div>
      </Link>

      <nav className="flex-1 space-y-1">
        <p className="px-3 text-[10px] uppercase tracking-widest text-aris-muted-2 mb-2">Platform</p>
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-aris-emerald/10 text-aris-emerald-light border border-aris-emerald/20"
                  : "text-aris-muted hover:bg-white/5 hover:text-aris-text border border-transparent",
              )}
            >
              <span className="flex items-center gap-2.5">
                <item.icon size={16} className={active ? "text-aris-emerald-light" : "text-aris-muted-2 group-hover:text-aris-text"} />
                {item.label}
              </span>
              {item.badge && (
                <span className="rounded-full bg-aris-gold/10 text-aris-gold text-[9px] px-1.5 py-0.5 border border-aris-gold/30">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 space-y-1 border-t border-aris-border-soft pt-4">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-aris-muted hover:bg-white/5 hover:text-aris-text transition-colors"
        >
          <Home size={16} className="text-aris-muted-2" />
          Back to overview site
        </Link>
        <div className="rounded-xl border border-aris-border bg-aris-surface p-3 mt-2">
          <p className="text-xs text-aris-muted leading-relaxed">
            Connected to <span className="text-aris-emerald-light font-medium">AfriScout</span> via
            private API — decisions, tempo & disciplinary data synced.
          </p>
        </div>
      </div>
    </aside>
  );
}
