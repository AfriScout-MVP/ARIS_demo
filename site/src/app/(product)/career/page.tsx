"use client";

import { useState } from "react";
import { referees, careerTimeline } from "@/lib/mock-data";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { GraduationCap, BadgeCheck, Clock, AlertCircle, BookOpen } from "lucide-react";

const licenses = [
  { name: "CAF Elite Panel License", status: "valid" as const, expires: "2027-06-30" },
  { name: "FIFA International Badge", status: "valid" as const, expires: "2026-12-31" },
  { name: "VAR Certification (CAF Academy)", status: "renewal-soon" as const, expires: "2026-10-15" },
  { name: "Sports Medicine — Fitness Protocol", status: "valid" as const, expires: "2027-03-01" },
];

const trainings = [
  { name: "Advanced VAR Protocol 2026", progress: 100 },
  { name: "Match Pressure Management", progress: 100 },
  { name: "Continental Rule Update — Q3 2026", progress: 62 },
  { name: "Mentorship: Developing Referees", progress: 30 },
];

const statusTone = { valid: "emerald", "renewal-soon": "gold", expired: "red" } as const;
const statusLabel = { valid: "Valid", "renewal-soon": "Renewal due soon", expired: "Expired" };

export default function CareerPage() {
  const [refId, setRefId] = useState(referees[0].id);
  const referee = referees.find((r) => r.id === refId)!;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Select referee passport" icon={<GraduationCap size={16} />} />
        <div className="flex flex-wrap gap-2">
          {referees.map((r) => (
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
          <CardHeader title="Career progression" subtitle={`${referee.name} · ${referee.yearsActive} years active`} />
          <ol className="relative border-l border-aris-border pl-5 space-y-5">
            {careerTimeline.map((e) => (
              <li key={e.year} className="relative">
                <span className="absolute -left-[27px] top-0.5 h-3 w-3 rounded-full bg-aris-emerald ring-4 ring-aris-emerald/15" />
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-aris-emerald-light">{e.year}</span>
                  <Badge tone="muted">{e.type}</Badge>
                </div>
                <p className="text-sm font-medium text-aris-text mt-1">{e.title}</p>
                <p className="text-xs text-aris-muted mt-0.5">{e.detail}</p>
              </li>
            ))}
          </ol>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Licenses & certifications" icon={<BadgeCheck size={16} />} />
            <div className="space-y-2.5">
              {licenses.map((l) => (
                <div key={l.name} className="flex items-start justify-between gap-2 rounded-lg border border-aris-border bg-aris-surface-2/50 px-3 py-2.5">
                  <div>
                    <p className="text-sm text-aris-text">{l.name}</p>
                    <p className="text-[11px] text-aris-muted flex items-center gap-1 mt-0.5">
                      <Clock size={11} /> Expires {l.expires}
                    </p>
                  </div>
                  <Badge tone={statusTone[l.status]}>
                    {l.status === "renewal-soon" && <AlertCircle size={11} />}
                    {statusLabel[l.status]}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Active training" icon={<BookOpen size={16} />} />
            <div className="space-y-4">
              {trainings.map((t) => (
                <div key={t.name}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-aris-muted">{t.name}</span>
                    <span className="text-aris-text font-medium">{t.progress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-aris-border overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", t.progress === 100 ? "bg-aris-emerald" : "bg-aris-gold")}
                      style={{ width: `${t.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
