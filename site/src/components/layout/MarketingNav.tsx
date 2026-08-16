"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { Whistle } from "@/components/icons/Whistle";

const links = [
  { href: "#vision", label: "Vision" },
  { href: "#platform", label: "Platform" },
  { href: "#competition", label: "Competition" },
  { href: "#integration", label: "AfriScout synergy" },
  { href: "#market", label: "Market" },
  { href: "#roadmap", label: "Roadmap" },
];

export function MarketingNav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-aris-border/70 bg-aris-bg/80 backdrop-blur-lg">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 sm:px-8 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-aris-emerald to-aris-emerald-dark text-[#04140c]">
            <Whistle size={18} />
          </span>
          <div className="leading-tight">
            <p className="font-display font-bold text-aris-text text-sm tracking-wide">ARIS</p>
            <p className="text-[10px] text-aris-muted">by Prestige Solutions of Afrika</p>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-7">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-sm text-aris-muted hover:text-aris-text transition-colors">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg bg-aris-emerald px-4 py-2 text-sm font-semibold text-[#04140c] hover:bg-aris-emerald-light transition-colors"
          >
            Enter live demo
            <ArrowUpRight size={15} />
          </Link>
        </div>

        <button className="md:hidden text-aris-text" onClick={() => setOpen((v) => !v)}>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-aris-border px-5 py-4 space-y-3 bg-aris-bg-2">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="block text-sm text-aris-muted" onClick={() => setOpen(false)}>
              {l.label}
            </a>
          ))}
          <Link
            href="/dashboard"
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-aris-emerald px-4 py-2.5 text-sm font-semibold text-[#04140c]"
          >
            Enter live demo
            <ArrowUpRight size={15} />
          </Link>
        </div>
      )}
    </header>
  );
}
