"use client";

import { useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { zoneDistribution, federations, clientSegments } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { Landmark, Users, ShieldCheck } from "lucide-react";

const zones = ["All zones", "UNIFFAC", "UFOA", "COSAFA", "CECAFA", "UNAF"];

export default function FederationsPage() {
  const [zone, setZone] = useState("All zones");
  const rows = zone === "All zones" ? federations : federations.filter((f) => f.zone === zone);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {zoneDistribution.map((z) => (
          <button
            key={z.zone}
            onClick={() => setZone(z.zone)}
            className={cn(
              "rounded-2xl border p-5 text-left card-hover transition-colors",
              zone === z.zone ? "border-aris-emerald/40 bg-aris-emerald/5" : "border-aris-border bg-aris-surface/80",
            )}
          >
            <Landmark size={16} className="text-aris-emerald-light mb-2" />
            <p className="font-display text-xl font-semibold text-aris-text">{z.zone}</p>
            <p className="text-xs text-aris-muted mt-1">{z.referees.toLocaleString()} referees</p>
            <p className="text-xs text-aris-muted">Avg. ARPS {z.avgArps}</p>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader title="Federations directory" subtitle="Tracked referee corps by national federation" icon={<Users size={16} />} />
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

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((f) => (
            <div key={f.code} className="rounded-xl border border-aris-border bg-aris-surface-2/50 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-2 text-sm font-medium text-aris-text">
                  <span className="text-lg">{f.flag}</span>
                  {f.code}
                </span>
                <Badge tone="muted">{f.zone}</Badge>
              </div>
              <p className="text-xs text-aris-muted mb-3">{f.country}</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-sm font-semibold text-aris-text">{f.refereeCount}</p>
                  <p className="text-[9px] text-aris-muted-2 uppercase">Referees</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-aris-emerald-light">{f.avgArps}</p>
                  <p className="text-[9px] text-aris-muted-2 uppercase">Avg. ARPS</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-aris-gold">{f.eliteCount}</p>
                  <p className="text-[9px] text-aris-muted-2 uppercase">Elite</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Client segments" subtitle="Who ARIS federations data serves" icon={<ShieldCheck size={16} />} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {clientSegments.map((s) => (
            <div key={s.segment} className="rounded-lg border border-aris-border bg-aris-surface-2/40 p-3.5">
              <p className="text-sm font-medium text-aris-text">{s.segment}</p>
              <p className="text-xs text-aris-muted mt-1.5 leading-relaxed">{s.usage}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
