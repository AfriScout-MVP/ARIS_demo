import { Section } from "./Section";
import { BadgeCheck, Network, Dumbbell, Trophy, GraduationCap, Waypoints } from "lucide-react";

const future = [
  { icon: BadgeCheck, text: "A unique pan-African referee passport, recognized and fed by multiple federations and CAF zones simultaneously." },
  { icon: Network, text: "Interoperability with other African match-data platforms beyond AfriScout, via the same open API model." },
  { icon: Trophy, text: "Progressive extension to other team sports (basketball, handball), reusing the RMCS engine and scoring model." },
  { icon: Waypoints, text: "Possible contribution at FIFA/CAF scale to continental refereeing evaluation standardization." },
  { icon: Dumbbell, text: "Integration of physical data (GPS, optical tracking) as these technologies become accessible in Africa." },
  { icon: GraduationCap, text: "A certification and continuous-training hub attached to the Career Manager, linked with existing referee academies." },
];

export function FutureSection() {
  return (
    <Section eyebrow="Vision — beyond v1" title="Where this platform goes next.">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {future.map((f, i) => (
          <div key={i} className="flex gap-3 rounded-2xl border border-aris-border bg-aris-surface/70 p-5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-aris-emerald/10 text-aris-emerald-light">
              <f.icon size={16} />
            </span>
            <p className="text-sm text-aris-muted leading-relaxed">{f.text}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
