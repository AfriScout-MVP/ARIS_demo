"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { referees, type RefereeStatus } from "@/lib/mock-data";
import { Badge } from "@/components/ui/Badge";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { Search, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

const zones = ["All zones", "UNIFFAC", "UFOA", "COSAFA", "CECAFA", "UNAF"] as const;
const statusTone: Record<RefereeStatus, "emerald" | "gold" | "red" | "blue"> = {
  active: "emerald",
  "elite-pool": "gold",
  suspended: "red",
  training: "blue",
};
const statusLabel: Record<RefereeStatus, string> = {
  active: "Active",
  "elite-pool": "Elite pool",
  suspended: "Suspended",
  training: "In training",
};

export default function RefereesPage() {
  const [query, setQuery] = useState("");
  const [zone, setZone] = useState<(typeof zones)[number]>("All zones");

  const filtered = useMemo(() => {
    return referees.filter((r) => {
      const matchesZone = zone === "All zones" || r.zone === zone;
      const matchesQuery =
        query.trim() === "" ||
        r.name.toLowerCase().includes(query.toLowerCase()) ||
        r.country.toLowerCase().includes(query.toLowerCase());
      return matchesZone && matchesQuery;
    });
  }, [query, zone]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-aris-border bg-aris-surface px-3 py-2.5 flex-1">
          <Search size={16} className="text-aris-muted-2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or country…"
            className="bg-transparent text-sm text-aris-text placeholder:text-aris-muted-2 outline-none w-full"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <SlidersHorizontal size={14} className="text-aris-muted-2 shrink-0" />
          {zones.map((z) => (
            <button
              key={z}
              onClick={() => setZone(z)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                zone === z
                  ? "border-aris-emerald/40 bg-aris-emerald/10 text-aris-emerald-light"
                  : "border-aris-border text-aris-muted hover:text-aris-text",
              )}
            >
              {z}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-aris-muted">{filtered.length} referees · showing a demo sample of {referees.length}</p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((r) => (
          <Link
            key={r.id}
            href={`/referees/${r.id}`}
            className="rounded-2xl border border-aris-border bg-aris-surface/80 p-5 card-hover flex flex-col"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-aris-surface-2 to-aris-bg-2 border border-aris-border text-sm font-semibold text-aris-text">
                  {r.initials}
                </span>
                <div>
                  <p className="font-medium text-aris-text text-sm">{r.name}</p>
                  <p className="text-xs text-aris-muted">{r.flag} {r.country} · {r.zone}</p>
                </div>
              </div>
              <ScoreRing value={r.arps} size={46} strokeWidth={4.5} />
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              <Badge tone={statusTone[r.status]}>{statusLabel[r.status]}</Badge>
              <Badge tone="muted">{r.level}</Badge>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center border-t border-aris-border-soft pt-3">
              <div>
                <p className="text-sm font-semibold text-aris-text">{r.matches}</p>
                <p className="text-[10px] text-aris-muted uppercase tracking-wide">Matches</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-aris-text">{r.varAccuracy}%</p>
                <p className="text-[10px] text-aris-muted uppercase tracking-wide">VAR acc.</p>
              </div>
              <div>
                <p className={cn("text-sm font-semibold", r.trend >= 0 ? "text-aris-emerald-light" : "text-aris-red")}>
                  {r.trend >= 0 ? "+" : ""}{r.trend}
                </p>
                <p className="text-[10px] text-aris-muted uppercase tracking-wide">Trend</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
