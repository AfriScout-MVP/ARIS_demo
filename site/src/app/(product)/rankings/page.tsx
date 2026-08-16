"use client";

import { useState } from "react";
import Link from "next/link";
import { rankings } from "@/lib/mock-data";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { Trophy, TrendingDown, TrendingUp, Medal } from "lucide-react";

const zones = ["All zones", "UNIFFAC", "UFOA", "COSAFA", "CECAFA", "UNAF"];

const medalColor = ["#e2b13c", "#c7ccd6", "#a97f1f"];

export default function RankingsPage() {
  const [zone, setZone] = useState("All zones");
  const rows = zone === "All zones" ? rankings : rankings.filter((r) => r.zone === zone);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {rankings.slice(0, 3).map((r, i) => (
          <Link
            key={r.refereeId}
            href={`/referees/${r.refereeId}`}
            className="rounded-2xl border border-aris-border bg-gradient-to-br from-aris-surface to-aris-surface-2 p-5 text-center card-hover"
          >
            <Medal size={24} style={{ color: medalColor[i] }} className="mx-auto mb-2" />
            <p className="font-display text-lg font-semibold text-aris-text">{r.name}</p>
            <p className="text-xs text-aris-muted">{r.flag} {r.country}</p>
            <p className="font-display text-3xl font-bold text-aris-emerald-light mt-3">{r.arps}</p>
            <p className="text-[10px] text-aris-muted uppercase mt-1">ARPS · Rank #{r.rank}</p>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader title="Continental leaderboard" subtitle="Cumulative performance ranking, all tracked referees" icon={<Trophy size={16} />} />
        <div className="flex flex-wrap gap-2 mb-4">
          {zones.map((z) => (
            <button
              key={z}
              onClick={() => setZone(z)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                zone === z
                  ? "border-aris-emerald/40 bg-aris-emerald/10 text-aris-emerald-light"
                  : "border-aris-border text-aris-muted hover:text-aris-text",
              )}
            >
              {z}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-aris-border text-left text-xs uppercase tracking-wide text-aris-muted">
                <th className="py-2.5 pr-3 font-medium">#</th>
                <th className="py-2.5 pr-3 font-medium">Referee</th>
                <th className="py-2.5 pr-3 font-medium">Zone</th>
                <th className="py-2.5 pr-3 font-medium">Matches</th>
                <th className="py-2.5 pr-3 font-medium">ARPS</th>
                <th className="py-2.5 pr-3 font-medium">Trend</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.refereeId} className="border-b border-aris-border-soft hover:bg-white/5">
                  <td className="py-3 pr-3 text-aris-muted">{r.rank}</td>
                  <td className="py-3 pr-3">
                    <Link href={`/referees/${r.refereeId}`} className="text-aris-text font-medium hover:text-aris-emerald-light">
                      {r.flag} {r.name}
                    </Link>
                    <p className="text-xs text-aris-muted">{r.country}</p>
                  </td>
                  <td className="py-3 pr-3">
                    <Badge tone="muted">{r.zone}</Badge>
                  </td>
                  <td className="py-3 pr-3 text-aris-text">{r.matches}</td>
                  <td className="py-3 pr-3 font-display font-semibold text-aris-text">{r.arps}</td>
                  <td className="py-3 pr-3">
                    <span className={cn("flex items-center gap-1 text-xs font-medium", r.delta >= 0 ? "text-aris-emerald-light" : "text-aris-red")}>
                      {r.delta >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                      {r.delta >= 0 ? "+" : ""}{r.delta}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
