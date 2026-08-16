import { Section } from "./Section";
import { clientSegments } from "@/lib/mock-data";
import { Users2 } from "lucide-react";

export function MarketSection() {
  return (
    <Section
      id="market"
      eyebrow="Clients & applications"
      title="From grassroots academies to CAF itself."
      description="Eight segments, one data model — each with a distinct product depth, from lightweight assignment to full continental performance tracking."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {clientSegments.map((s) => (
          <div key={s.segment} className="rounded-2xl border border-aris-border bg-aris-surface/70 p-5 card-hover">
            <Users2 size={17} className="text-aris-emerald-light mb-3" />
            <h4 className="font-display font-semibold text-aris-text text-sm">{s.segment}</h4>
            <p className="mt-2 text-xs text-aris-muted leading-relaxed">{s.usage}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
