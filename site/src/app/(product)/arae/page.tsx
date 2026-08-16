"use client";

import { useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { assignmentCandidates } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { Radar, Plane, BedDouble, History, ShieldAlert, CheckCircle2, Sparkles } from "lucide-react";

const riskTone = { Low: "emerald", Medium: "gold", High: "red" } as const;

export default function AraePage() {
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const top = assignmentCandidates.find((c) => c.recommended)!;

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-br from-aris-surface to-aris-surface-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <Badge tone="gold">CAF Champions League — Final</Badge>
            <h2 className="font-display text-xl font-semibold text-aris-text mt-2">Al Ahly vs. Espérance de Tunis</h2>
            <p className="text-xs text-aris-muted mt-1">Cairo, Egypt · Sat 20:00 CAT · Capacity 74,100</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-aris-muted">
            <Radar size={15} className="text-aris-emerald-light" />
            ARAE evaluated {assignmentCandidates.length} eligible referees in 1.2s
          </div>
        </div>
      </Card>

      <div className="grid gap-4">
        {assignmentCandidates.map((c) => (
          <Card key={c.refereeId} className={cn(c.recommended && "border-aris-emerald/40 bg-aris-emerald/5")} hover>
            <div className="flex flex-col lg:flex-row lg:items-center gap-5">
              <div className="flex items-center gap-3 lg:w-56 shrink-0">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-aris-surface-2 border border-aris-border text-sm font-semibold text-aris-text">
                  {c.name.split(" ").map((n) => n[0]).join("")}
                </span>
                <div>
                  <p className="font-medium text-aris-text text-sm">{c.name}</p>
                  {c.recommended && (
                    <span className="flex items-center gap-1 text-[11px] text-aris-emerald-light">
                      <Sparkles size={11} /> ARAE recommended
                    </span>
                  )}
                </div>
              </div>

              <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Metric label="RMCS" value={`${c.rmcs}`} icon={<Radar size={13} />} highlight={c.rmcs >= 90} />
                <Metric label="Fitness" value={`${c.fitness}`} icon={<History size={13} />} />
                <Metric label="Travel" value={`${c.travelHours}h`} icon={<Plane size={13} />} />
                <Metric label="Rest days" value={`${c.restDays}d`} icon={<BedDouble size={13} />} />
              </div>

              <div className="flex items-center gap-3 lg:w-56 justify-between lg:justify-end shrink-0">
                <Badge tone={riskTone[c.frictionRisk]}>
                  <ShieldAlert size={12} /> {c.frictionRisk} friction risk
                </Badge>
                {confirmed === c.refereeId ? (
                  <Badge tone="emerald"><CheckCircle2 size={12} /> Confirmed</Badge>
                ) : (
                  <button
                    onClick={() => setConfirmed(c.refereeId)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                      c.recommended
                        ? "bg-aris-emerald text-[#04140c] hover:bg-aris-emerald-light"
                        : "border border-aris-border text-aris-muted hover:text-aris-text",
                    )}
                  >
                    Assign
                  </button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="Assignment traceability" subtitle="Audit log for this designation — justification chain" />
        <ol className="space-y-3 text-sm">
          <li className="flex gap-3">
            <span className="text-aris-muted-2 text-xs w-24 shrink-0">08:14:02</span>
            <span className="text-aris-muted">ARAE pulled {assignmentCandidates.length} eligible CAF Elite referees for zone UNAF + UFOA cross-assignment.</span>
          </li>
          <li className="flex gap-3">
            <span className="text-aris-muted-2 text-xs w-24 shrink-0">08:14:03</span>
            <span className="text-aris-muted">Computed RMCS using match tier, historical head-to-head friction, and travel/rest constraints.</span>
          </li>
          <li className="flex gap-3">
            <span className="text-aris-muted-2 text-xs w-24 shrink-0">08:14:03</span>
            <span className="text-aris-emerald-light">
              Recommended {top.name} — highest RMCS ({top.rmcs}), lowest friction risk, within rest-day threshold.
            </span>
          </li>
          {confirmed && (
            <li className="flex gap-3">
              <span className="text-aris-muted-2 text-xs w-24 shrink-0">08:16:41</span>
              <span className="text-aris-text">
                Admin confirmed assignment: <span className="font-medium">{assignmentCandidates.find((c) => c.refereeId === confirmed)?.name}</span>.
              </span>
            </li>
          )}
        </ol>
      </Card>
    </div>
  );
}

function Metric({ label, value, icon, highlight }: { label: string; value: string; icon: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-aris-border bg-aris-surface-2/50 px-3 py-2">
      <span className="flex items-center gap-1.5 text-[10px] text-aris-muted uppercase">
        {icon}
        {label}
      </span>
      <p className={cn("font-display text-base font-semibold mt-0.5", highlight ? "text-aris-emerald-light" : "text-aris-text")}>{value}</p>
    </div>
  );
}
