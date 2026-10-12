"use client";

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/LocaleProvider";
import { countryFlag, officialById, roleKey, type CrewSlot } from "@/lib/mock-data";

/**
 * The crew strip — six or seven slots, always in the same order, always the
 * same width. It is the one object that appears on every ARIS screen, so a
 * half-filled crew is recognisable at a glance from anywhere in the product.
 */

const stateRing: Record<CrewSlot["state"], string> = {
  confirmed: "border-line bg-ink-3",
  pending: "border-amber/40 bg-amber/[0.07]",
  declined: "border-card-red/45 bg-card-red/[0.07]",
  empty: "slot-empty",
};

const stateDot: Record<CrewSlot["state"], string> = {
  confirmed: "bg-pitch",
  pending: "bg-amber",
  declined: "bg-card-red",
  empty: "bg-transparent",
};

export function CrewStrip({
  crew,
  size = "sm",
  onSlotClick,
  activeRole,
  className,
}: {
  crew: CrewSlot[];
  size?: "sm" | "md";
  onSlotClick?: (slot: CrewSlot) => void;
  activeRole?: string;
  className?: string;
}) {
  const t = useT();
  const interactive = Boolean(onSlotClick);

  return (
    <div className={cn("flex min-w-0 flex-wrap gap-1.5", className)}>
      {crew.map((slot) => {
        const official = slot.officialId ? officialById(slot.officialId) : undefined;
        const Tag = interactive ? "button" : "div";
        return (
          <Tag
            key={slot.role}
            {...(interactive
              ? {
                  type: "button" as const,
                  onClick: () => onSlotClick?.(slot),
                  title: `${t(roleKey[slot.role])} — ${official?.name ?? t("common.unassigned")}`,
                }
              : { title: `${t(roleKey[slot.role])} — ${official?.name ?? t("common.unassigned")}` })}
            className={cn(
              "relative flex flex-col justify-between rounded-lg border text-left transition-colors",
              size === "sm" ? "h-[46px] w-[58px] px-1.5 py-1" : "h-[62px] w-[92px] px-2 py-1.5",
              stateRing[slot.state],
              interactive && "hover:border-pitch/60",
              activeRole === slot.role && "border-pitch ring-1 ring-pitch/40",
            )}
          >
            <span className="flex items-center justify-between">
              <span className="board text-[10px] font-semibold uppercase tracking-wider text-chalk-faint">
                {slot.role === "FOURTH" ? "4TH" : slot.role}
              </span>
              {slot.state !== "empty" && (
                <span className={cn("h-1.5 w-1.5 rounded-full", stateDot[slot.state])} />
              )}
            </span>

            {official ? (
              <span className="min-w-0">
                <span
                  className={cn(
                    "block truncate font-medium text-chalk",
                    size === "sm" ? "text-[11px]" : "text-xs",
                  )}
                >
                  {size === "sm" ? official.initials : official.name.split(" ").slice(-1)[0]}
                </span>
                {size === "md" && (
                  <span className="block text-[10px] text-chalk-faint">
                    {countryFlag(official.countryCode)}
                  </span>
                )}
              </span>
            ) : (
              <span className={cn("text-chalk-faint", size === "sm" ? "text-[11px]" : "text-xs")}>—</span>
            )}
          </Tag>
        );
      })}
    </div>
  );
}

/** One-line summary used when the full strip will not fit. */
export function CrewSummary({ crew }: { crew: CrewSlot[] }) {
  const t = useT();
  const open = crew.filter((s) => s.state === "empty" || s.state === "declined").length;
  if (open === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-pitch">
        <span className="h-1.5 w-1.5 rounded-full bg-pitch" />
        {t("common.confirmed")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-card-red">
      <span className="h-1.5 w-1.5 rounded-full bg-card-red" />
      {open} {t("calendar.slotsOpen")}
    </span>
  );
}
