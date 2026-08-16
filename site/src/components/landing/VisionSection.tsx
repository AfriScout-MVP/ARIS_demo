import { Section } from "./Section";
import { Globe2, Target, Layers } from "lucide-react";

const zones = ["UNIFFAC", "UFOA", "COSAFA", "CECAFA", "UNAF"];

export function VisionSection() {
  return (
    <Section
      id="vision"
      eyebrow="Context & vision"
      title="Built to become the continental reference for refereeing intelligence."
      description="ARIS (Africa Referee Intelligence System) is a standalone platform developed by Prestige Solutions of Afrika, entirely dedicated to the refereeing ecosystem: performance evaluation, intelligent designation of referee teams, and career management."
    >
      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-2xl border border-aris-border bg-aris-surface/70 p-6">
          <Target size={20} className="text-aris-emerald-light mb-3" />
          <h3 className="font-display font-semibold text-aris-text mb-2">Who it serves</h3>
          <p className="text-sm text-aris-muted leading-relaxed">
            Federations, leagues, CAF, and its regional zones — UNIFFAC, UFOA, COSAFA, CECAFA, UNAF —
            plus major competitions: AFCON, CHAN, and CAF interclub tournaments.
          </p>
        </div>
        <div className="rounded-2xl border border-aris-border bg-aris-surface/70 p-6">
          <Layers size={20} className="text-aris-emerald-light mb-3" />
          <h3 className="font-display font-semibold text-aris-text mb-2">Where it starts</h3>
          <p className="text-sm text-aris-muted leading-relaxed">
            No development has been engaged on ARIS to date — this platform previews the functional
            scope defined in the ARIS Cahier des Charges v2.0, July 2026, not a shipped product.
          </p>
        </div>
        <div className="rounded-2xl border border-aris-border bg-aris-surface/70 p-6">
          <Globe2 size={20} className="text-aris-emerald-light mb-3" />
          <h3 className="font-display font-semibold text-aris-text mb-2">Continental reach</h3>
          <p className="text-sm text-aris-muted leading-relaxed">
            Five CAF zones targeted from day one, with a data model designed to scale to a
            pan-African digital referee passport.
          </p>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        {zones.map((z) => (
          <span key={z} className="rounded-full border border-aris-border bg-aris-surface px-3.5 py-1.5 text-xs text-aris-muted">
            {z}
          </span>
        ))}
      </div>
    </Section>
  );
}
