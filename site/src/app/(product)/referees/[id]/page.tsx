import { notFound } from "next/navigation";
import Link from "next/link";
import { referees, careerTimeline } from "@/lib/mock-data";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ScoreRing } from "@/components/ui/ScoreRing";
import {
  ArrowLeft,
  Activity,
  Flag,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  MapPin,
  Radar,
} from "lucide-react";

export function generateStaticParams() {
  return referees.map((r) => ({ id: r.id }));
}

export default async function RefereeProfilePage({ params }: PageProps<"/referees/[id]">) {
  const { id } = await params;
  const referee = referees.find((r) => r.id === id);
  if (!referee) notFound();

  const positive = referee.trend >= 0;

  return (
    <div className="space-y-6">
      <Link href="/referees" className="inline-flex items-center gap-1.5 text-sm text-aris-muted hover:text-aris-text">
        <ArrowLeft size={15} />
        Back to directory
      </Link>

      <div className="rounded-2xl border border-aris-border bg-gradient-to-br from-aris-surface to-aris-surface-2 p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-aris-emerald to-aris-emerald-dark text-2xl font-bold text-[#04140c]">
            {referee.initials}
          </span>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl font-bold text-aris-text">{referee.name}</h2>
              <Badge tone="gold">{referee.level}</Badge>
            </div>
            <p className="mt-1 text-sm text-aris-muted flex items-center gap-1.5">
              <MapPin size={13} /> {referee.flag} {referee.country} · {referee.federation} · {referee.zone} zone
            </p>
            <p className="mt-3 text-sm text-aris-muted max-w-2xl leading-relaxed">{referee.bio}</p>
            {referee.nextMatch && (
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-aris-emerald-light">
                <Flag size={13} /> Next appointment: {referee.nextMatch}
              </p>
            )}
          </div>
          <div className="flex flex-col items-center gap-1">
            <ScoreRing value={referee.arps} size={92} label="ARPS" />
            <span className={`flex items-center gap-1 text-xs font-medium ${positive ? "text-aris-emerald-light" : "text-aris-red"}`}>
              {positive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {positive ? "+" : ""}{referee.trend} pts
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Matches officiated", value: referee.matches, icon: Activity },
          { label: "RMCS average", value: referee.rmcsAvg, icon: Radar },
          { label: "VAR accuracy", value: `${referee.varAccuracy}%`, icon: ShieldCheck },
          { label: "Fitness index", value: referee.fitness, icon: Activity },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-aris-border bg-aris-surface/80 p-4">
            <s.icon size={15} className="text-aris-muted-2 mb-2" />
            <p className="font-display text-2xl font-semibold text-aris-text">{s.value}</p>
            <p className="text-xs text-aris-muted mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Disciplinary record" subtitle="Cards issued, career to date" />
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-aris-yellow/10 border border-aris-yellow/20 px-3 py-2.5">
              <span className="text-sm text-aris-text">Yellow cards</span>
              <span className="font-semibold text-aris-yellow">{referee.cards.yellow}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-aris-red/10 border border-aris-red/20 px-3 py-2.5">
              <span className="text-sm text-aris-text">Red cards</span>
              <span className="font-semibold text-aris-red">{referee.cards.red}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-white/5 border border-aris-border px-3 py-2.5">
              <span className="text-sm text-aris-text">Years active</span>
              <span className="font-semibold text-aris-text">{referee.yearsActive}</span>
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Digital passport — career timeline" subtitle="Licenses, training & appointments" />
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
      </div>
    </div>
  );
}
