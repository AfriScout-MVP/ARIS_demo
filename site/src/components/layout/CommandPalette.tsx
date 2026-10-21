"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CornerDownLeft, Globe2, Search, Users } from "@/components/icons/glyphs";
import { cn } from "@/lib/utils";
import { useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { useScope } from "@/lib/scope/ScopeProvider";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { useDataset } from "@/lib/dataset/DatasetProvider";
import { isAdmin } from "@/lib/roles";
import {
  competitionById,
  countries,
  countryName,
  fixtures,
  referees,
  refereeHref,
} from "@/lib/store";
import { navItemsFor } from "./nav-items";

interface Row {
  id: string;
  label: string;
  meta: string;
  /** Country whose flag is drawn in front of the row. */
  flag?: string;
  group: "page" | "referee" | "fixture" | "country";
  run: () => void;
}

/** Mounting is what resets the palette, so opening it never needs an effect. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <Palette onClose={onClose} />;
}

function Palette({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const { setScope } = useScope();
  const { user } = useDataset();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const go = (href: string) => () => {
      router.push(href);
      onClose();
    };

    const pages: Row[] = navItemsFor(user?.role).map((item) => ({
      id: `page-${item.href}`,
      label: t(item.labelKey),
      meta: t("common.open"),
      group: "page",
      run: go(item.href),
    }));

    const people: Row[] = referees.map((r) => ({
      id: `ref-${r.id}`,
      label: r.name,
      meta: r.level,
      flag: r.countryCode,
      group: "referee",
      run: go(refereeHref(r.id)),
    }));

    const games: Row[] = fixtures.slice(0, 80).map((f) => ({
      id: `fx-${f.id}`,
      label: `${f.home} — ${f.away}`,
      meta: `${competitionById.get(f.competitionId)?.name ?? ""} · ${f.date}`,
      group: "fixture",
      run: go("/calendar"),
    }));

    // only a super-admin chooses a country to look at; a federation seat is fixed on its own
    const places: Row[] = (isAdmin(user) ? countries : []).map((c) => ({
      id: `co-${c.code}`,
      label: countryName(c.code, locale),
      flag: c.code,
      meta: `${c.federation} · ${t("federations.switchScope")}`,
      group: "country",
      run: () => {
        setScope({ kind: "country", code: c.code });
        router.push("/calendar");
        onClose();
      },
    }));

    const all = [...pages, ...people, ...games, ...places];
    if (!q) return [...pages, ...people.slice(0, 5)];
    return all.filter((row) => `${row.label} ${row.meta}`.toLowerCase().includes(q)).slice(0, 24);
  }, [query, t, locale, router, onClose, setScope, user]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, rows.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        rows[cursor]?.run();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [rows, cursor, onClose]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const groupIcon = {
    page: Search,
    referee: Users,
    fixture: CalendarDays,
    country: Globe2,
  } as const;

  const groupLabel: Record<Row["group"], string> = {
    page: t("common.open"),
    referee: t("common.referees"),
    fixture: t("calendar.fixtures"),
    country: t("common.countries"),
  };

  let lastGroup: Row["group"] | null = null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
      <button
        aria-label={t("common.close")}
        onClick={onClose}
        className="absolute inset-0 bg-ink-0/80 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-xl overflow-hidden rounded-[14px] border border-line-strong bg-ink-2 shadow-2xl shadow-black/70">
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <Search size={15} className="text-chalk-faint" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            placeholder={t("common.searchHint")}
            className="w-full bg-transparent text-sm text-chalk outline-none placeholder:text-chalk-faint"
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 text-[10px] text-chalk-faint">ESC</kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1.5">
          {rows.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-chalk-dim">{t("common.noResults")}</p>
              <p className="mt-1 text-xs text-chalk-faint">{t("common.noResultsHint")}</p>
            </div>
          )}

          {rows.map((row, i) => {
            const showGroup = row.group !== lastGroup;
            lastGroup = row.group;
            const Icon = groupIcon[row.group];
            return (
              <div key={row.id}>
                {showGroup && (
                  <p className="px-4 pb-1 pt-2.5 text-xs font-medium text-chalk-faint">
                    {groupLabel[row.group]}
                  </p>
                )}
                <button
                  data-index={i}
                  onMouseEnter={() => setCursor(i)}
                  onClick={row.run}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-4 py-2 text-left",
                    cursor === i ? "bg-wash/[0.07]" : "hover:bg-wash/[0.04]",
                  )}
                >
                  <Icon size={14} className="shrink-0 text-chalk-faint" />
                  <span className="min-w-0 flex-1 truncate text-sm text-chalk">
                    {row.group === "country" && row.flag && <CountryFlag code={row.flag} className="mr-1.5" />}
                    {row.label}
                  </span>
                  <span className="hidden shrink-0 items-center gap-1.5 truncate text-xs text-chalk-faint sm:flex">
                    {row.group !== "country" && row.flag && <CountryFlag code={row.flag} />}
                    {row.meta}
                  </span>
                  {cursor === i && <CornerDownLeft size={13} className="shrink-0 text-chalk-faint" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
