"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, PlayCircle, Sparkles } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, YAxis } from "recharts";
import { arpsTrend, kpis } from "@/lib/mock-data";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-radial-fade">
      <div className="absolute inset-0 bg-grid opacity-60 [mask-image:radial-gradient(ellipse_at_top,black,transparent_75%)]" />
      <div className="relative mx-auto max-w-7xl px-5 sm:px-8 pt-16 pb-24 sm:pt-24 sm:pb-32">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex justify-center"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-aris-emerald/30 bg-aris-emerald/10 px-3.5 py-1.5 text-xs font-medium text-aris-emerald-light">
            <Sparkles size={13} />
            Version 2.0 — Prestige Solutions of Afrika · Investor Preview
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="font-display mt-7 text-center text-4xl sm:text-6xl font-bold leading-[1.08] tracking-tight text-aris-text"
        >
          The intelligence layer
          <br />
          <span className="text-gradient">African refereeing</span> never had.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mx-auto mt-6 max-w-2xl text-center text-base sm:text-lg text-aris-muted"
        >
          ARIS is the continental performance, assignment and career platform for match officials —
          built for CAF, its zones, federations and leagues. Performance scoring, AI-powered team
          designation, and a digital referee passport, in one system.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3"
        >
          <Link
            href="/dashboard"
            className="group inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-aris-emerald px-6 py-3.5 text-sm font-semibold text-[#04140c] hover:bg-aris-emerald-light transition-colors"
          >
            <PlayCircle size={18} />
            Enter the live product demo
            <ArrowUpRight size={16} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
          <a
            href="#platform"
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-aris-border bg-aris-surface px-6 py-3.5 text-sm font-semibold text-aris-text hover:border-aris-emerald/40 transition-colors"
          >
            Explore the platform
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4 }}
          className="mt-16 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4"
        >
          {[
            { label: "Referees tracked", value: kpis.totalReferees.toLocaleString() },
            { label: "Federations connected", value: kpis.activeFederations },
            { label: "Matches analyzed", value: kpis.matchesAnalyzed.toLocaleString() },
            { label: "Avg. VAR accuracy", value: `${kpis.varAccuracy}%` },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-aris-border bg-aris-surface/70 px-4 py-4 text-center">
              <p className="font-display text-2xl sm:text-3xl font-semibold text-aris-text">{s.value}</p>
              <p className="mt-1 text-[11px] sm:text-xs text-aris-muted">{s.label}</p>
            </div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.5 }}
          className="mt-10 mx-auto max-w-4xl rounded-2xl border border-aris-border bg-aris-surface/70 p-4 sm:p-6"
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-aris-muted">Continental average ARPS</p>
              <p className="font-display text-xl font-semibold text-aris-emerald-light">
                {kpis.avgArps} <span className="text-xs text-aris-muted font-normal">/ 100</span>
              </p>
            </div>
            <span className="text-xs text-aris-emerald-light">+{kpis.avgArpsTrend} pts · last 6 months</span>
          </div>
          <div className="h-24">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={arpsTrend} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="heroArps" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#17c778" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#17c778" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <YAxis domain={[75, 90]} hide />
                <Area type="monotone" dataKey="score" stroke="#17c778" strokeWidth={2} fill="url(#heroArps)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
