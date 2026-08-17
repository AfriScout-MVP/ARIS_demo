"use client";

import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Card, CardHeader } from "@/components/ui/Card";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { CompareRadar } from "@/components/charts/CompareRadar";
import { referees, getSubIndices } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { GitCompareArrows, X } from "lucide-react";

const COLORS = ["#17c778", "#e2b13c", "#3b82f6"];
const MAX_SELECTION = 3;

export default function ComparePage() {
  const [selected, setSelected] = useState<string[]>([referees[0].id, referees[2].id]);

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_SELECTION) return prev;
      return [...prev, id];
    });
  }

  const selectedReferees = selected.map((id) => referees.find((r) => r.id === id)!).filter(Boolean);

  const radarData = useMemo(() => {
    const metrics: { key: keyof ReturnType<typeof getSubIndices>; label: string }[] = [
      { key: "ras", label: "RAS" },
      { key: "cei", label: "CEI" },
      { key: "mds", label: "MDS" },
      { key: "prs", label: "PRS" },
      { key: "ci", label: "CI" },
    ];
    return metrics.map((m) => {
      const row: Record<string, string | number> = { metric: m.label };
      selectedReferees.forEach((r) => {
        row[r.name] = getSubIndices(r)[m.key];
      });
      return row;
    });
  }, [selectedReferees]);

  const barData = [
    { stat: "ARPS", ...Object.fromEntries(selectedReferees.map((r) => [r.name, r.arps])) },
    { stat: "RMCS", ...Object.fromEntries(selectedReferees.map((r) => [r.name, r.rmcsAvg])) },
    { stat: "Fitness", ...Object.fromEntries(selectedReferees.map((r) => [r.name, r.fitness])) },
    { stat: "VAR acc.", ...Object.fromEntries(selectedReferees.map((r) => [r.name, r.varAccuracy])) },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Select referees to compare"
          subtitle={`${selected.length}/${MAX_SELECTION} selected`}
          icon={<GitCompareArrows size={16} />}
        />
        <div className="flex flex-wrap gap-2">
          {referees.map((r) => (
            <button
              key={r.id}
              onClick={() => toggle(r.id)}
              disabled={!selected.includes(r.id) && selected.length >= MAX_SELECTION}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed",
                selected.includes(r.id)
                  ? "border-aris-emerald/40 bg-aris-emerald/10 text-aris-emerald-light"
                  : "border-aris-border text-aris-muted hover:text-aris-text",
              )}
            >
              <span>{r.flag}</span>
              {r.name}
              {selected.includes(r.id) && <X size={12} />}
            </button>
          ))}
        </div>
      </Card>

      {selectedReferees.length === 0 ? (
        <Card>
          <p className="text-sm text-aris-muted text-center py-8">Select at least one referee to begin comparing.</p>
        </Card>
      ) : (
        <>
          <div className={cn("grid gap-4", selectedReferees.length === 1 ? "sm:grid-cols-1" : selectedReferees.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
            {selectedReferees.map((r, i) => (
              <Card key={r.id} className="text-center" style={{ borderColor: `${COLORS[i]}40` } as React.CSSProperties}>
                <ScoreRing value={r.arps} size={64} label="ARPS" />
                <p className="font-display font-semibold text-aris-text mt-2">{r.name}</p>
                <p className="text-xs text-aris-muted">{r.flag} {r.country} · {r.zone}</p>
                <div className="grid grid-cols-2 gap-2 mt-4 text-center">
                  <div className="rounded-lg bg-white/5 border border-aris-border px-2 py-2">
                    <p className="text-sm font-semibold text-aris-text">{r.rmcsAvg}</p>
                    <p className="text-[9px] text-aris-muted-2 uppercase">RMCS</p>
                  </div>
                  <div className="rounded-lg bg-white/5 border border-aris-border px-2 py-2">
                    <p className="text-sm font-semibold text-aris-text">{r.matches}</p>
                    <p className="text-[9px] text-aris-muted-2 uppercase">Matches</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Sub-index overlay" subtitle="RAS · CEI · MDS · PRS · CI" />
              <CompareRadar data={radarData} seriesNames={selectedReferees.map((r) => r.name)} />
            </Card>

            <Card>
              <CardHeader title="Core stats" subtitle="Side-by-side comparison" />
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid stroke="#1c2837" vertical={false} />
                    <XAxis dataKey="stat" stroke="#5c6d82" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#5c6d82" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: "#0d141e", border: "1px solid #1c2837", borderRadius: 10, fontSize: 12, color: "#eef3f8" }} />
                    <Legend wrapperStyle={{ fontSize: 12, color: "#8b9bb0" }} />
                    {selectedReferees.map((r, i) => (
                      <Bar key={r.id} dataKey={r.name} fill={COLORS[i % COLORS.length]} radius={[6, 6, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
