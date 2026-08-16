"use client";

import { useState } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { sampleMatch, matchDecisions, pressureTimeline, type MatchDecision } from "@/lib/mock-data";
import { AlertTriangle, CheckCircle2, PlayCircle, Radio, Gauge } from "lucide-react";
import { cn } from "@/lib/utils";

const typeTone: Record<MatchDecision["type"], "red" | "gold" | "blue" | "emerald"> = {
  Penalty: "red",
  "Red Card": "red",
  "Yellow Card": "gold",
  Offside: "blue",
  Handball: "gold",
  Foul: "emerald",
};

const tooltipStyle = {
  background: "#0d141e",
  border: "1px solid #1c2837",
  borderRadius: 10,
  fontSize: 12,
  color: "#eef3f8",
};

export default function DecisionEnginePage() {
  const [selected, setSelected] = useState<string>(matchDecisions[1].id);
  const active = matchDecisions.find((d) => d.id === selected)!;

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs text-aris-muted">{sampleMatch.competition} · {sampleMatch.date}</p>
            <h2 className="font-display text-xl font-semibold text-aris-text mt-1">
              {sampleMatch.home} <span className="text-aris-muted font-normal">{sampleMatch.score}</span> {sampleMatch.away}
            </h2>
            <p className="text-xs text-aris-muted mt-1">Referee: {sampleMatch.referee} · analyzed via AfriScout tagging pipeline</p>
          </div>
          <div className="flex gap-3">
            <div className="text-center rounded-xl border border-aris-border bg-aris-surface-2/60 px-4 py-2">
              <p className="font-display text-lg font-semibold text-aris-emerald-light">{sampleMatch.arpsForMatch}</p>
              <p className="text-[10px] text-aris-muted uppercase">Match ARPS</p>
            </div>
            <div className="text-center rounded-xl border border-aris-border bg-aris-surface-2/60 px-4 py-2">
              <p className="font-display text-lg font-semibold text-aris-gold">{sampleMatch.rmcs}</p>
              <p className="text-[10px] text-aris-muted uppercase">RMCS</p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Decision timeline"
            subtitle={`${matchDecisions.length} reviewable events — click to inspect`}
            icon={<PlayCircle size={16} />}
          />
          <div className="space-y-2">
            {matchDecisions.map((d) => (
              <button
                key={d.id}
                onClick={() => setSelected(d.id)}
                className={cn(
                  "w-full text-left flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
                  selected === d.id
                    ? "border-aris-emerald/40 bg-aris-emerald/5"
                    : "border-aris-border bg-aris-surface-2/40 hover:border-aris-border",
                )}
              >
                <span className="font-display text-sm font-semibold text-aris-muted w-9 shrink-0">{d.minute}&apos;</span>
                <Badge tone={typeTone[d.type]}>{d.type}</Badge>
                <span className="flex-1 text-sm text-aris-text truncate">{d.description}</span>
                {d.varReview && <Radio size={14} className="text-aris-blue shrink-0" />}
                {d.finalCall === "Overturned" ? (
                  <AlertTriangle size={15} className="text-aris-gold shrink-0" />
                ) : (
                  <CheckCircle2 size={15} className="text-aris-emerald-light shrink-0" />
                )}
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Decision detail" subtitle={`Minute ${active.minute}'`} icon={<Gauge size={16} />} />
          <div className="space-y-4">
            <div>
              <Badge tone={typeTone[active.type]}>{active.type}</Badge>
              <p className="mt-3 text-sm text-aris-text leading-relaxed">{active.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-white/5 border border-aris-border px-3 py-2">
                <p className="text-[10px] text-aris-muted uppercase">Initial call</p>
                <p className="text-aris-text font-medium mt-0.5">{active.initialCall}</p>
              </div>
              <div className="rounded-lg bg-white/5 border border-aris-border px-3 py-2">
                <p className="text-[10px] text-aris-muted uppercase">Final call</p>
                <p className={cn("font-medium mt-0.5", active.finalCall === "Overturned" ? "text-aris-gold" : "text-aris-emerald-light")}>
                  {active.finalCall}
                </p>
              </div>
              <div className="rounded-lg bg-white/5 border border-aris-border px-3 py-2">
                <p className="text-[10px] text-aris-muted uppercase">VAR review</p>
                <p className="text-aris-text font-medium mt-0.5">{active.varReview ? "Yes" : "No"}</p>
              </div>
              <div className="rounded-lg bg-white/5 border border-aris-border px-3 py-2">
                <p className="text-[10px] text-aris-muted uppercase">Confidence</p>
                <p className="text-aris-text font-medium mt-0.5">{active.confidence}%</p>
              </div>
            </div>
            <div>
              <p className="text-[10px] text-aris-muted uppercase mb-1.5">Pressure index at decision</p>
              <div className="h-2 rounded-full bg-aris-border overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-aris-emerald to-aris-red"
                  style={{ width: `${active.pressureIndex}%` }}
                />
              </div>
              <p className="text-xs text-aris-muted mt-1">{active.pressureIndex} / 100</p>
            </div>
            <div>
              <p className="text-[10px] text-aris-muted uppercase mb-1.5">Players involved</p>
              <div className="flex flex-wrap gap-1.5">
                {active.players.map((p) => (
                  <Badge key={p} tone="muted">{p}</Badge>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Match pressure index" subtitle="Contextual pressure over 90 minutes — decisions plotted" />
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={pressureTimeline} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="pressure" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4453" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#ef4453" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1c2837" vertical={false} />
              <XAxis dataKey="minute" stroke="#5c6d82" fontSize={12} tickLine={false} axisLine={false} unit="'" />
              <YAxis stroke="#5c6d82" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              {matchDecisions.map((d) => (
                <ReferenceLine key={d.id} x={d.minute} stroke="#e2b13c" strokeDasharray="3 3" />
              ))}
              <Area type="monotone" dataKey="pressure" stroke="#ef4453" strokeWidth={2.5} fill="url(#pressure)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
