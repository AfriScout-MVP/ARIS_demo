import { Section } from "./Section";
import { Badge } from "@/components/ui/Badge";
import { Gauge, Radar, GraduationCap, CheckCircle2 } from "lucide-react";

const pillars = [
  {
    icon: Gauge,
    tone: "emerald" as const,
    name: "Referee Intelligence System",
    tag: "RIS",
    desc: "Performance evaluation at the core: ARPS composite scoring, decision-quality analysis, positional heat maps, and a digital referee passport.",
    items: ["ARPS performance score", "Decision Engine (fouls, cards, VAR)", "Heat maps enriched by AfriScout events", "Fitness & Pressure Index"],
  },
  {
    icon: Radar,
    tone: "gold" as const,
    name: "AI Referee Assignment Engine",
    tag: "ARAE",
    desc: "Intelligent designation of referee teams based on match level, availability, and compatibility — with a full audit trail.",
    items: ["RMCS compatibility score", "Automated team designation", "Assignment traceability & audit log", "Friction-risk screening"],
  },
  {
    icon: GraduationCap,
    tone: "blue" as const,
    name: "Referee Career Manager",
    tag: "Career",
    desc: "Full career lifecycle: history, progression, training, and license/certification tracking with renewal alerts.",
    items: ["FIFA / CAF license tracking", "Training & certification history", "Progression & assessment log", "Academy integration"],
  },
];

export function PlatformSection() {
  return (
    <Section
      id="platform"
      eyebrow="Functional scope"
      title="Three engines, one referee record."
      description="Every module below is scoped in the ARIS Cahier des Charges v2.0 — from P1 (build first) to P4 (career layer)."
    >
      <div className="grid gap-6 lg:grid-cols-3">
        {pillars.map((p) => (
          <div key={p.tag} className="rounded-2xl border border-aris-border bg-aris-surface/70 p-6 card-hover">
            <div className="flex items-center justify-between mb-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 text-aris-emerald-light">
                <p.icon size={20} />
              </span>
              <Badge tone={p.tone}>{p.tag}</Badge>
            </div>
            <h3 className="font-display text-lg font-semibold text-aris-text">{p.name}</h3>
            <p className="mt-2 text-sm text-aris-muted leading-relaxed">{p.desc}</p>
            <ul className="mt-5 space-y-2.5">
              {p.items.map((it) => (
                <li key={it} className="flex items-start gap-2 text-sm text-aris-text/90">
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-aris-emerald-light" />
                  {it}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}
