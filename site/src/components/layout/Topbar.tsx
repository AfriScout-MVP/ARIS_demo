"use client";

import { usePathname } from "next/navigation";
import { Search, Bell, Menu } from "lucide-react";
import { AvatarMenu } from "./AvatarMenu";
import { Badge } from "@/components/ui/Badge";
import { navItems } from "./nav-items";

const descriptions: Record<string, string> = {
  "/dashboard": "Continental refereeing intelligence, at a glance.",
  "/referees": "Directory of tracked officials across CAF zones.",
  "/decision-engine": "Automated review of match decisions & VAR calls.",
  "/heatmaps": "Referee positioning, enriched with AfriScout event data.",
  "/arae": "AI-recommended referee team for upcoming fixtures.",
  "/rankings": "Cumulative performance leaderboard.",
  "/career": "Digital passport: licenses, training, progression.",
  "/reports": "Combined Match + Refereeing report export.",
};

export function Topbar() {
  const pathname = usePathname();
  const current = navItems.find((n) => pathname === n.href || pathname.startsWith(n.href + "/"));
  const title = current?.label ?? "ARIS";
  const description = current ? descriptions[current.href] : undefined;

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between gap-4 border-b border-aris-border bg-aris-bg/90 backdrop-blur px-4 sm:px-6 py-4">
      <div className="flex items-center gap-3 min-w-0">
        <button className="lg:hidden text-aris-muted">
          <Menu size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="font-display text-lg sm:text-xl font-semibold text-aris-text truncate">{title}</h1>
          {description && <p className="text-xs text-aris-muted hidden sm:block truncate">{description}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden md:flex items-center gap-2 rounded-lg border border-aris-border bg-aris-surface px-3 py-1.5 w-64">
          <Search size={15} className="text-aris-muted-2" />
          <input
            placeholder="Search referees, matches, zones…"
            className="bg-transparent text-sm text-aris-text placeholder:text-aris-muted-2 outline-none w-full"
          />
        </div>
        <Badge tone="emerald" className="hidden sm:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-aris-emerald animate-pulse-slow" />
          Demo data
        </Badge>
        <button className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-aris-border bg-aris-surface text-aris-muted hover:text-aris-text transition-colors">
          <Bell size={16} />
          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-aris-red text-[9px] flex items-center justify-center text-white">3</span>
        </button>
        <AvatarMenu />
      </div>
    </header>
  );
}
