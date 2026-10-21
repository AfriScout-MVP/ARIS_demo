"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Globe2, Search } from "@/components/icons/glyphs";
import { cn } from "@/lib/utils";
import { useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { useScope } from "@/lib/scope/ScopeProvider";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { countries, countryByCode, countryName, zoneKey, zones } from "@/lib/store";

/**
 * Scope is the first control on the page because it is the first decision the
 * user makes: am I running the continent today, a zone, or one federation?
 * Every screen below reads it.
 */
export function ScopeSelect() {
  const t = useT();
  const { locale } = useLocale();
  const { scope, setScope, lockedTo } = useScope();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const zoneLabel = (zone: (typeof zones)[number]) => `${zone} · ${t(zoneKey[zone])}`;
  const presentZones = useMemo(() => zones.filter((z) => countries.some((c) => c.zone === z)), []);

  const label = useMemo(() => {
    if (scope.kind === "all") return <>{t("common.allAfrica")}</>;
    if (scope.kind === "zone") return <>{`${scope.zone} · ${t(zoneKey[scope.zone])}`}</>;
    return (
      <>
        <CountryFlag code={scope.code} /> {countryName(scope.code, locale)}
      </>
    );
  }, [scope, t, locale]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter((c) =>
      `${c.name} ${c.nameFr} ${c.nameEs} ${c.nameDe} ${c.federation} ${c.code}`.toLowerCase().includes(q),
    );
  }, [query]);

  // A federation seat is tied to one country: no picker, just the badge that says which.
  if (lockedTo) {
    const country = countryByCode.get(lockedTo);
    return (
      <div
        className="flex h-10 w-full min-w-0 items-center gap-2 rounded-[10px] border border-field bg-ink-2 px-3 text-sm text-chalk sm:w-auto sm:max-w-[320px]"
        title={t("common.scopeLocked")}
      >
        <CountryFlag code={lockedTo} />
        <span className="truncate">{countryName(lockedTo, locale)}</span>
        {country?.federation && <span className="shrink-0 text-[11px] font-semibold text-chalk-faint">{country.federation}</span>}
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex h-10 w-full min-w-0 items-center gap-2 rounded-[10px] border border-field bg-ink-2 px-3 text-sm text-chalk transition-colors hover:border-red-500/50 sm:w-auto sm:max-w-[280px]"
      >
        <Globe2 size={14} className="shrink-0 text-chalk-faint" />
        <span className="flex min-w-0 items-center gap-1.5 truncate">{label}</span>
        <ChevronDown size={13} className={cn("shrink-0 text-chalk-faint transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-2 w-[min(300px,calc(100vw-32px))] overflow-hidden rounded-[14px] border border-line bg-ink-2 shadow-xl shadow-black/20">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search size={13} className="text-chalk-faint" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("common.country")}
              className="w-full bg-transparent text-sm text-chalk outline-none placeholder:text-chalk-faint"
            />
          </div>

          <div className="max-h-[340px] overflow-y-auto py-1">
            <Option
              label={t("common.allAfrica")}
              selected={scope.kind === "all"}
              onSelect={() => {
                setScope({ kind: "all" });
                setOpen(false);
              }}
            />

            <p className="px-3 pb-1 pt-2.5 text-xs font-medium text-chalk-faint">
              {t("common.zone")}
            </p>
            {presentZones.map((zone) => (
              <Option
                key={zone}
                label={zoneLabel(zone)}
                selected={scope.kind === "zone" && scope.zone === zone}
                onSelect={() => {
                  setScope({ kind: "zone", zone });
                  setOpen(false);
                }}
              />
            ))}

            <p className="px-3 pb-1 pt-2.5 text-xs font-medium text-chalk-faint">
              {t("common.federation")}
            </p>
            {filtered.map((country) => (
              <Option
                key={country.code}
                label={
                  <>
                    <CountryFlag code={country.code} /> {countryName(country.code, locale)}
                  </>
                }
                meta={country.federation}
                selected={scope.kind === "country" && scope.code === country.code}
                onSelect={() => {
                  setScope({ kind: "country", code: country.code });
                  setOpen(false);
                }}
              />
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-3 text-xs text-chalk-faint">{t("common.noResults")}</p>
            )}
          </div>

          <p className="border-t border-line px-3 py-2 text-[11px] text-chalk-faint">{t("common.scopeHint")}</p>
        </div>
      )}
    </div>
  );
}

function Option({
  label,
  meta,
  selected,
  onSelect,
}: {
  label: React.ReactNode;
  meta?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition-colors",
        selected ? "text-chalk" : "text-chalk-dim hover:bg-red-500/10 hover:text-chalk",
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5 truncate">{label}</span>
      <span className="flex shrink-0 items-center gap-2">
        {meta && <span className="text-[11px] text-chalk-faint">{meta}</span>}
        {selected && <Check size={13} className="text-pitch" />}
      </span>
    </button>
  );
}
