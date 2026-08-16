"use client";

import { useMemo, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Pitch } from "@/components/pitch/Pitch";
import { referees, generateHeatPoints } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { Flame, Info } from "lucide-react";

export default function HeatmapsPage() {
  const [refId, setRefId] = useState(referees[0].id);
  const referee = referees.find((r) => r.id === refId)!;

  const points = useMemo(() => generateHeatPoints(referee.name.length * 7), [referee.name]);

  const zoneStats = useMemo(() => {
    const zones = { defensive: 0, middle: 0, attacking: 0 };
    points.forEach((p) => {
      if (p.x < 33) zones.defensive++;
      else if (p.x < 66) zones.middle++;
      else zones.attacking++;
    });
    const total = points.length;
    return [
      { label: "Defensive third", pct: Math.round((zones.defensive / total) * 100) },
      { label: "Middle third", pct: Math.round((zones.middle / total) * 100) },
      { label: "Attacking third", pct: Math.round((zones.attacking / total) * 100) },
    ];
  }, [points]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Select referee" subtitle="Positional heat map, enriched by AfriScout event coordinates" icon={<Flame size={16} />} />
        <div className="flex flex-wrap gap-2">
          {referees.slice(0, 8).map((r) => (
            <button
              key={r.id}
              onClick={() => setRefId(r.id)}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                refId === r.id
                  ? "border-aris-emerald/40 bg-aris-emerald/10 text-aris-emerald-light"
                  : "border-aris-border text-aris-muted hover:text-aris-text",
              )}
            >
              <span>{r.flag}</span>
              {r.name}
            </button>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={`${referee.name} — positioning map`}
            subtitle="Last officiated match · attacking direction left → right"
          />
          <div className="rounded-xl overflow-hidden border border-aris-border aspect-[100/64]">
            <Pitch>
              {points.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={0.9 + p.intensity * 1.4}
                  fill="#17c778"
                  fillOpacity={0.12 + p.intensity * 0.35}
                />
              ))}
            </Pitch>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-aris-muted">
            <Info size={13} /> Positions are inferred from AfriScout tagged event coordinates near the referee&apos;s match location — demo data.
          </p>
        </Card>

        <Card>
          <CardHeader title="Zone occupancy" subtitle="Share of tracked positions" />
          <div className="space-y-4">
            {zoneStats.map((z) => (
              <div key={z.label}>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-aris-muted">{z.label}</span>
                  <span className="text-aris-text font-medium">{z.pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-aris-border overflow-hidden">
                  <div className="h-full rounded-full bg-aris-emerald" style={{ width: `${z.pct}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-aris-border bg-aris-surface-2/60 p-3 text-center">
              <p className="font-display text-xl font-semibold text-aris-text">{referee.fitness}</p>
              <p className="text-[10px] text-aris-muted uppercase mt-0.5">Fitness index</p>
            </div>
            <div className="rounded-lg border border-aris-border bg-aris-surface-2/60 p-3 text-center">
              <p className="font-display text-xl font-semibold text-aris-text">~9.8km</p>
              <p className="text-[10px] text-aris-muted uppercase mt-0.5">Est. distance</p>
            </div>
          </div>
          <Badge tone="blue" className="mt-4 w-full justify-center">GPS/optical tracking planned — Vision roadmap</Badge>
        </Card>
      </div>
    </div>
  );
}
