"use client";

import { useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { matches, decisionsBreakdown } from "@/lib/mock-data";
import { FileText, Download, Printer, ShieldCheck, Gauge, Video } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ReportsPage() {
  const [reportId, setReportId] = useState(matches[0].id);
  const match = matches.find((m) => m.id === reportId) ?? matches[0];

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit">
          <CardHeader title="Recent reports" subtitle="Combined Match + Refereeing" icon={<FileText size={16} />} />
          <div className="space-y-2">
            {matches.map((m) => (
              <button
                key={m.id}
                onClick={() => setReportId(m.id)}
                className={cn(
                  "w-full text-left rounded-lg border px-3 py-2.5 transition-colors",
                  reportId === m.id
                    ? "border-aris-emerald/40 bg-aris-emerald/5"
                    : "border-aris-border bg-aris-surface-2/40 hover:border-aris-border",
                )}
              >
                <p className="text-sm text-aris-text font-medium truncate">{m.home} vs. {m.away}</p>
                <p className="text-xs text-aris-muted truncate">{m.competition}</p>
                <p className="text-[10px] text-aris-muted-2 mt-1">{m.date}</p>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs text-aris-muted">PDF preview</p>
              <h3 className="font-display text-lg font-semibold text-aris-text">Combined Match + Refereeing Report</h3>
            </div>
            <div className="flex gap-2">
              <button className="flex items-center gap-1.5 rounded-lg border border-aris-border px-3 py-1.5 text-xs text-aris-muted hover:text-aris-text">
                <Printer size={13} /> Print
              </button>
              <button className="flex items-center gap-1.5 rounded-lg bg-aris-emerald px-3 py-1.5 text-xs font-semibold text-[#04140c] hover:bg-aris-emerald-light">
                <Download size={13} /> Export PDF
              </button>
            </div>
          </div>

          {/* Report sheet */}
          <div className="rounded-xl border border-aris-border bg-white text-[#0b1420] p-6 sm:p-10 shadow-2xl shadow-black/40">
            <div className="flex items-center justify-between border-b border-black/10 pb-4 mb-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">AfriScout × ARIS</p>
                <h4 className="font-display text-2xl font-bold mt-1">{match.home} {match.score} {match.away}</h4>
                <p className="text-xs text-neutral-500 mt-1">{match.competition} · {match.date}</p>
              </div>
              <span className="text-4xl">⚖️</span>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="rounded-lg bg-emerald-50 p-3 text-center">
                <p className="font-display text-2xl font-bold text-emerald-700">{match.arpsForMatch}</p>
                <p className="text-[10px] text-neutral-500 uppercase mt-1">Referee ARPS</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-3 text-center">
                <p className="font-display text-2xl font-bold text-amber-700">{match.rmcs}</p>
                <p className="text-[10px] text-neutral-500 uppercase mt-1">RMCS fit</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-3 text-center">
                <p className="font-display text-2xl font-bold text-blue-700">{match.pressureAvg}</p>
                <p className="text-[10px] text-neutral-500 uppercase mt-1">Avg. pressure</p>
              </div>
            </div>

            <div className="mb-8">
              <h5 className="flex items-center gap-2 text-sm font-semibold mb-3">
                <ShieldCheck size={15} className="text-emerald-700" /> Refereeing quality block
              </h5>
              <p className="text-sm text-neutral-600 leading-relaxed">
                {match.referee} officiated with a match ARPS of {match.arpsForMatch}/100. VAR review accuracy
                across {match.decisions.filter((d) => d.varReview).length} reviewed decisions was consistent
                with the referee&apos;s season average.
              </p>
              <div className="mt-3 flex gap-2 flex-wrap">
                {decisionsBreakdown.map((d) => (
                  <span key={d.name} className="text-[10px] rounded-full px-2.5 py-1 bg-neutral-100 text-neutral-600">
                    {d.name}: {d.value}%
                  </span>
                ))}
              </div>
            </div>

            <div>
              <h5 className="flex items-center gap-2 text-sm font-semibold mb-3">
                <Video size={15} className="text-emerald-700" /> VAR decision log
              </h5>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-neutral-400 border-b border-black/10">
                    <th className="py-1.5 font-medium">Min</th>
                    <th className="py-1.5 font-medium">Type</th>
                    <th className="py-1.5 font-medium">Call</th>
                  </tr>
                </thead>
                <tbody>
                  {match.decisions.map((d) => (
                    <tr key={d.id} className="border-b border-black/5">
                      <td className="py-1.5 text-neutral-500">{d.minute}&apos;</td>
                      <td className="py-1.5 text-neutral-700">{d.type}</td>
                      <td className={cn("py-1.5 font-medium", d.finalCall === "Overturned" ? "text-amber-600" : "text-emerald-700")}>
                        {d.finalCall}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-8 pt-4 border-t border-black/10 flex items-center justify-between text-[10px] text-neutral-400">
              <span>Generated by ARIS — demo report, illustrative data only</span>
              <span className="flex items-center gap-1"><Gauge size={11} /> Page 1 of 3</span>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Why this matters" subtitle="Section 6 of the ARIS Cahier des Charges" />
        <p className="text-sm text-aris-muted leading-relaxed">
          <Badge tone="emerald" className="mr-2">Unified product</Badge>
          A single PDF dossier presents both the tactical analysis (AfriScout) and refereeing quality (ARIS)
          for the same match — a product no identified competitor offers today in a unified way, sellable
          directly to leagues and media partners.
        </p>
      </Card>
    </div>
  );
}
