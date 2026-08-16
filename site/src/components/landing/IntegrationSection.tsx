import { Section } from "./Section";
import { ArrowRight, ArrowLeft } from "lucide-react";

export function IntegrationSection() {
  return (
    <Section
      id="integration"
      eyebrow="Integration model"
      title="Two products, one API — never a dependency."
      description="ARIS and AfriScout stay fully distinct products, connected only through a two-way API data exchange, governed by a private data-sharing agreement."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-aris-border bg-aris-surface/70 p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="rounded-lg bg-aris-blue/10 text-blue-300 px-2.5 py-1 text-xs font-semibold">AfriScout → ARIS</span>
            <ArrowRight size={14} className="text-aris-muted" />
          </div>
          <p className="text-sm text-aris-muted mb-4">What ARIS consumes:</p>
          <ul className="space-y-3 text-sm text-aris-text/90">
            <li className="flex gap-2"><span className="text-aris-emerald-light">•</span> Position & context of already-tagged disciplinary events (fouls, cards) for the Decision Engine and Heat Maps.</li>
            <li className="flex gap-2"><span className="text-aris-emerald-light">•</span> Match tempo & pressure data to contextualize the Pressure Index.</li>
            <li className="flex gap-2"><span className="text-aris-emerald-light">•</span> Match result & metadata for RMCS calculation.</li>
          </ul>
          <p className="mt-4 text-xs text-aris-muted-2">Access: private API by default — a public aggregated, non-nominative feed may be considered separately.</p>
        </div>

        <div className="rounded-2xl border border-aris-border bg-aris-surface/70 p-6">
          <div className="flex items-center gap-2 mb-4">
            <ArrowLeft size={14} className="text-aris-muted" />
            <span className="rounded-lg bg-aris-emerald/10 text-aris-emerald-light px-2.5 py-1 text-xs font-semibold">ARIS → AfriScout</span>
          </div>
          <p className="text-sm text-aris-muted mb-4">What ARIS can provide (value-add, not a dependency):</p>
          <ul className="space-y-3 text-sm text-aris-text/90">
            <li className="flex gap-2"><span className="text-aris-gold">•</span> A &ldquo;Match refereeing quality&rdquo; block, embeddable in an AfriScout match report.</li>
            <li className="flex gap-2"><span className="text-aris-gold">•</span> The timestamped VAR / refereeing decision log, to complete AfriScout report timelines.</li>
            <li className="flex gap-2"><span className="text-aris-gold">•</span> The designated referee team&apos;s profile, for match preview sheets.</li>
          </ul>
          <p className="mt-4 text-xs text-aris-muted-2">AfriScout does not cover refereeing — this is a one-directional value offer from ARIS.</p>
        </div>
      </div>
    </Section>
  );
}
