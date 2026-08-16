import { Section } from "./Section";
import { leverageFeatures } from "@/lib/mock-data";
import { Zap } from "lucide-react";

export function LeverageSection() {
  return (
    <Section
      eyebrow="Structural advantage"
      title="ARIS doesn't start from zero — AfriScout already exists."
      description="No identified competitor — Western assignment platforms, TrackSwift, or CAF initiatives — has a sister scouting & video-tagging platform already operational. That's ARIS's most concrete structural edge."
    >
      <div className="grid gap-5 md:grid-cols-2">
        {leverageFeatures.map((f) => (
          <div key={f.feature} className="rounded-2xl border border-aris-border bg-aris-surface/70 p-5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-aris-gold/10 text-aris-gold">
                <Zap size={15} />
              </span>
              <div>
                <h4 className="font-medium text-aris-text text-sm">{f.feature}</h4>
                <p className="mt-1.5 text-xs text-aris-muted leading-relaxed">
                  <span className="text-aris-emerald-light">Lever: </span>
                  {f.lever}
                </p>
                <p className="mt-1.5 text-xs text-aris-muted leading-relaxed">
                  <span className="text-aris-gold">Value: </span>
                  {f.value}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
