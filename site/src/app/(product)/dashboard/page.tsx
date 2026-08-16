"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { StatTile } from "@/components/ui/StatTile";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ScoreRing } from "@/components/ui/ScoreRing";
import {
  kpis,
  arpsTrend,
  decisionsBreakdown,
  zoneDistribution,
  referees,
} from "@/lib/mock-data";
import { Users, Video, ShieldAlert, Radar, ArrowUpRight, AlertTriangle } from "lucide-react";
import Link from "next/link";

const tooltipStyle = {
  background: "#0d141e",
  border: "1px solid #1c2837",
  borderRadius: 10,
  fontSize: 12,
  color: "#eef3f8",
};

export default function DashboardPage() {
  const topReferees = referees.slice().sort((a, b) => b.arps - a.arps).slice(0, 5);
  const alerts = referees.filter((r) => r.status === "suspended" || r.trend < -3);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Referees tracked" value={kpis.totalReferees.toLocaleString()} icon={<Users size={16} />} />
        <StatTile label="Avg. ARPS score" value={kpis.avgArps} delta={kpis.avgArpsTrend} icon={<Radar size={16} />} />
        <StatTile label="Decisions reviewed" value={kpis.decisionsReviewed.toLocaleString()} icon={<Video size={16} />} />
        <StatTile label="VAR accuracy" value={`${kpis.varAccuracy}%`} suffix="continental" icon={<ShieldAlert size={16} />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="ARPS trend — continental average" subtitle="Last 6 months, all zones" />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={arpsTrend} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="dashArps" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#17c778" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#17c778" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1c2837" vertical={false} />
                <XAxis dataKey="month" stroke="#5c6d82" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis domain={[75, 90]} stroke="#5c6d82" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="score" stroke="#17c778" strokeWidth={2.5} fill="url(#dashArps)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Decision outcomes" subtitle="Season to date" />
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={decisionsBreakdown} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={3}>
                  {decisionsBreakdown.map((d) => (
                    <Cell key={d.name} fill={d.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5 mt-2">
            {decisionsBreakdown.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-aris-muted">
                  <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                  {d.name}
                </span>
                <span className="text-aris-text font-medium">{d.value}%</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Referees by CAF zone" subtitle="Population & average ARPS" />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={zoneDistribution} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="#1c2837" vertical={false} />
                <XAxis dataKey="zone" stroke="#5c6d82" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#5c6d82" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12, color: "#8b9bb0" }} />
                <Bar dataKey="referees" name="Referees" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                <Bar dataKey="avgArps" name="Avg. ARPS" fill="#17c778" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Attention needed" subtitle={`${alerts.length} open items`} icon={<AlertTriangle size={16} />} />
          <div className="space-y-3">
            {alerts.map((r) => (
              <Link
                key={r.id}
                href={`/referees/${r.id}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-aris-red/20 bg-aris-red/5 px-3 py-2.5 hover:border-aris-red/40 transition-colors"
              >
                <div>
                  <p className="text-sm text-aris-text">{r.name}</p>
                  <p className="text-xs text-aris-muted">{r.status === "suspended" ? "Under disciplinary review" : `ARPS trend ${r.trend}`}</p>
                </div>
                <Badge tone="red">{r.status === "suspended" ? "Suspended" : "Declining"}</Badge>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Top performing referees"
          subtitle="By ARPS, this season"
          action={
            <Link href="/rankings" className="flex items-center gap-1 text-xs text-aris-emerald-light hover:underline">
              Full ranking <ArrowUpRight size={12} />
            </Link>
          }
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {topReferees.map((r) => (
            <Link
              key={r.id}
              href={`/referees/${r.id}`}
              className="flex flex-col items-center gap-2 rounded-xl border border-aris-border bg-aris-surface-2/60 p-4 card-hover text-center"
            >
              <ScoreRing value={r.arps} size={56} />
              <p className="text-sm font-medium text-aris-text mt-1">{r.name}</p>
              <p className="text-xs text-aris-muted">{r.flag} {r.country}</p>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
