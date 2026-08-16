import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Whistle } from "@/components/icons/Whistle";

export function CtaFooter() {
  return (
    <>
      <section className="mx-auto max-w-7xl px-5 sm:px-8 pb-24">
        <div className="relative overflow-hidden rounded-3xl border border-aris-emerald/30 bg-gradient-to-br from-aris-emerald/10 via-aris-surface to-aris-surface p-10 sm:p-16 text-center">
          <div className="absolute inset-0 bg-grid opacity-30 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
          <div className="relative">
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-aris-text tracking-tight">
              Ready to see ARIS run a full match?
            </h2>
            <p className="mt-4 max-w-xl mx-auto text-aris-muted">
              Walk through the referee directory, decision engine, AI assignment, and career passport —
              all populated with realistic demo data.
            </p>
            <Link
              href="/dashboard"
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-aris-emerald px-7 py-3.5 text-sm font-semibold text-[#04140c] hover:bg-aris-emerald-light transition-colors"
            >
              Enter the live demo
              <ArrowUpRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-aris-border">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-aris-emerald to-aris-emerald-dark text-[#04140c]">
              <Whistle size={15} />
            </span>
            <p className="text-sm text-aris-muted">
              ARIS · Africa Referee Intelligence System — by Prestige Solutions of Afrika
            </p>
          </div>
          <p className="text-xs text-aris-muted-2">Cahier des Charges v2.0 · Investor preview · All data illustrative</p>
        </div>
      </footer>
    </>
  );
}
