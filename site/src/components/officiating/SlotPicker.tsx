"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "@/components/icons/glyphs";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/LocaleProvider";
import { Badge, Button } from "@/components/ui";
import { blockerKey, candidatesForSlot } from "@/lib/assignment";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { roleKey, type CrewRole, type CrewSlot, type Fixture } from "@/lib/store";

export function SlotPicker({
  fixture,
  role,
  crew,
  onPick,
  onClear,
  onClose,
}: {
  fixture: Fixture;
  role: CrewRole;
  crew: CrewSlot[];
  onPick: (officialId: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const candidates = useMemo(() => candidatesForSlot(fixture, role, crew), [fixture, role, crew]);
  const current = crew.find((s) => s.role === role)?.officialId;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? candidates.filter((c) => c.name.toLowerCase().includes(q)) : candidates;
    return list.slice(0, 40);
  }, [candidates, query]);

  const eligibleCount = candidates.filter((c) => c.blockers.length === 0).length;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
      <button aria-label={t("common.close")} onClick={onClose} className="absolute inset-0 bg-ink-0/80 backdrop-blur-sm" />

      <div className="relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line-strong bg-ink-2 sm:max-w-lg sm:rounded-[14px]">
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-xs font-medium text-chalk-faint">{t("calendar.fillSlot")}</p>
            <h2 className="mt-0.5 truncate font-display text-base font-semibold text-chalk">{t(roleKey[role])}</h2>
            <p className="mt-0.5 truncate text-xs text-chalk-faint">
              {fixture.home} — {fixture.away} · {fixture.date}
            </p>
          </div>
          <button onClick={onClose} aria-label={t("common.close")} className="rounded-lg p-1 text-chalk-faint hover:bg-wash/5 hover:text-chalk">
            <X size={17} />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <Search size={14} className="text-chalk-faint" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("calendar.chooseOfficial")}
            className="w-full bg-transparent text-sm text-chalk outline-none placeholder:text-chalk-faint"
          />
          <span className="shrink-0 text-[11px] text-chalk-faint">
            {eligibleCount} {t("calendar.eligible")}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.map((candidate) => {
            const blocked = candidate.blockers.length > 0;
            return (
              <button
                key={candidate.id}
                disabled={blocked}
                onClick={() => onPick(candidate.id)}
                className={cn(
                  "flex w-full items-center gap-3 border-b border-line px-4 py-2.5 text-left last:border-0",
                  blocked ? "cursor-not-allowed opacity-45" : "hover:bg-wash/[0.045]",
                  current === candidate.id && "bg-wash/[0.06]",
                )}
              >
                <span className="board w-9 shrink-0 text-sm font-semibold text-chalk">
                  {blocked ? "—" : candidate.score.toFixed(0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-chalk">
                    <CountryFlag code={candidate.countryCode} /> {candidate.name}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-chalk-faint">
                    {blocked ? (
                      t(blockerKey[candidate.blockers[0]])
                    ) : (
                      <>
                        {t("arae.rmcs")} {candidate.rating.toFixed(0)} · {t("arae.travel")} {candidate.travelHours}
                        {t("common.hours")} · {t("arae.rest")} {candidate.rest}
                        {t("common.days").slice(0, 1)}
                      </>
                    )}
                  </span>
                </span>
                {!blocked && candidate.cover && (
                  <Badge tone="var" className="shrink-0">
                    {t("calendar.cover")}
                  </Badge>
                )}
                {!blocked && candidate.frictionRisk !== "low" && (
                  <Badge tone={candidate.frictionRisk === "high" ? "red" : "amber"} className="shrink-0">
                    {t(candidate.frictionRisk === "high" ? "arae.riskHigh" : "arae.riskMedium")}
                  </Badge>
                )}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="px-4 py-8 text-center text-xs text-chalk-faint">{t("common.noResults")}</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
          <Button variant="ghost" size="sm" onClick={onClear} disabled={!current}>
            {t("calendar.clearSlot")}
          </Button>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
      </div>
    </div>
  );
}
