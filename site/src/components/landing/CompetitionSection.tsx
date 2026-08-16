import { Section } from "./Section";
import { competitors } from "@/lib/mock-data";
import { XCircle, CheckCircle2 } from "lucide-react";

export function CompetitionSection() {
  return (
    <Section
      id="competition"
      eyebrow="Competitive landscape"
      title="No one combines assignment, evaluation and career management for African football."
      description="A verified panorama of existing players: Western platforms cover assignment logistics but no performance evaluation. TrackSwift covers decision analysis but stays a proprietary tool for a single elite federation. That's the space ARIS can occupy."
    >
      <div className="overflow-x-auto rounded-2xl border border-aris-border">
        <table className="w-full text-sm min-w-[860px]">
          <thead>
            <tr className="border-b border-aris-border bg-aris-surface-2 text-left text-xs uppercase tracking-wide text-aris-muted">
              <th className="px-5 py-3.5 font-medium">Player</th>
              <th className="px-5 py-3.5 font-medium">Zone</th>
              <th className="px-5 py-3.5 font-medium">What they do</th>
              <th className="px-5 py-3.5 font-medium">ARIS edge</th>
            </tr>
          </thead>
          <tbody>
            {competitors.map((c, i) => (
              <tr key={c.name} className={i % 2 === 0 ? "bg-aris-surface/40" : "bg-aris-surface/70"}>
                <td className="px-5 py-4 font-medium text-aris-text align-top whitespace-nowrap">{c.name}</td>
                <td className="px-5 py-4 text-aris-muted align-top whitespace-nowrap">{c.zone}</td>
                <td className="px-5 py-4 text-aris-muted align-top">
                  <span className="flex gap-2"><XCircle size={15} className="mt-0.5 shrink-0 text-aris-red/80" />{c.does}</span>
                </td>
                <td className="px-5 py-4 text-aris-text/90 align-top">
                  <span className="flex gap-2"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-aris-emerald-light" />{c.arisEdge}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
