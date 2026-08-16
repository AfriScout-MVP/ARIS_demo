import { Section } from "./Section";
import { roadmapModules } from "@/lib/mock-data";
import { Badge } from "@/components/ui/Badge";

const priorityTone = {
  P1: "emerald",
  P2: "blue",
  P3: "gold",
  P4: "violet",
} as const;

const areas = ["RIS", "ARAE", "Career"] as const;

export function RoadmapSection() {
  return (
    <Section
      id="roadmap"
      eyebrow="Build sequence"
      title="Priority-ordered, from decision-critical to career layer."
      description="P1 modules ship the wedge — performance scoring and intelligent assignment. P4 rounds out the platform into a full career system."
    >
      <div className="space-y-10">
        {areas.map((area) => (
          <div key={area}>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-aris-muted mb-4">{area}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {roadmapModules
                .filter((m) => m.area === area)
                .map((m) => (
                  <div key={m.module} className="rounded-xl border border-aris-border bg-aris-surface/70 p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="font-medium text-aris-text text-sm leading-snug">{m.module}</h4>
                      <Badge tone={priorityTone[m.priority as keyof typeof priorityTone]}>{m.priority}</Badge>
                    </div>
                    <p className="text-xs text-aris-muted leading-relaxed">{m.desc}</p>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
