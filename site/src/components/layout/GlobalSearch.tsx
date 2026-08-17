"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, Users, Video, Gavel } from "lucide-react";
import { referees, matches, federations } from "@/lib/mock-data";

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;

    const refereeMatches = referees
      .filter((r) => r.name.toLowerCase().includes(q) || r.country.toLowerCase().includes(q) || r.federation.toLowerCase().includes(q))
      .slice(0, 4);

    const matchMatches = matches
      .filter((m) => `${m.home} ${m.away} ${m.competition}`.toLowerCase().includes(q))
      .slice(0, 3);

    const federationMatches = federations.filter((f) => f.code.toLowerCase().includes(q) || f.country.toLowerCase().includes(q)).slice(0, 3);

    return { refereeMatches, matchMatches, federationMatches };
  }, [query]);

  const hasResults = results && (results.refereeMatches.length || results.matchMatches.length || results.federationMatches.length);

  return (
    <div className="relative hidden md:block w-64" ref={ref}>
      <div className="flex items-center gap-2 rounded-lg border border-aris-border bg-aris-surface px-3 py-1.5">
        <Search size={15} className="text-aris-muted-2" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search referees, matches, zones…"
          className="bg-transparent text-sm text-aris-text placeholder:text-aris-muted-2 outline-none w-full"
        />
      </div>

      {open && query.trim() && (
        <div className="absolute right-0 mt-2 w-80 rounded-xl border border-aris-border bg-aris-surface-2 glass shadow-2xl shadow-black/40 overflow-hidden z-50 max-h-96 overflow-y-auto">
          {!hasResults && <p className="p-4 text-xs text-aris-muted">No results for &ldquo;{query}&rdquo;.</p>}

          {results && results.refereeMatches.length > 0 && (
            <div className="py-1">
              <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-aris-muted-2 flex items-center gap-1.5">
                <Users size={11} /> Referees
              </p>
              {results.refereeMatches.map((r) => (
                <Link
                  key={r.id}
                  href={`/referees/${r.id}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-aris-text hover:bg-white/5"
                >
                  <span>{r.flag}</span>
                  {r.name}
                  <span className="ml-auto text-xs text-aris-muted">{r.arps}</span>
                </Link>
              ))}
            </div>
          )}

          {results && results.matchMatches.length > 0 && (
            <div className="py-1 border-t border-aris-border-soft">
              <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-aris-muted-2 flex items-center gap-1.5">
                <Video size={11} /> Matches
              </p>
              {results.matchMatches.map((m) => (
                <Link
                  key={m.id}
                  href="/decision-engine"
                  onClick={() => setOpen(false)}
                  className="flex flex-col px-3 py-2 text-sm text-aris-text hover:bg-white/5"
                >
                  <span>{m.home} vs. {m.away}</span>
                  <span className="text-xs text-aris-muted">{m.competition}</span>
                </Link>
              ))}
            </div>
          )}

          {results && results.federationMatches.length > 0 && (
            <div className="py-1 border-t border-aris-border-soft">
              <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-aris-muted-2 flex items-center gap-1.5">
                <Gavel size={11} /> Federations
              </p>
              {results.federationMatches.map((f) => (
                <Link
                  key={f.code}
                  href="/federations"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-aris-text hover:bg-white/5"
                >
                  <span>{f.flag}</span>
                  {f.code}
                  <span className="ml-auto text-xs text-aris-muted">{f.zone}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
