"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { Locale } from "@/lib/i18n/dictionary";
import { mobilePrimary, navItems } from "./nav-items";

const primary = mobilePrimary
  .map((href) => navItems.find((item) => item.href === href))
  .filter((item): item is NonNullable<typeof item> => Boolean(item));

/** Short labels: the tab bar has roughly 62px per item on a small phone. */
const shortLabel: Record<string, Record<Locale, string>> = {
  "/": { en: "Overview", fr: "Accueil" },
  "/calendar": { en: "Calendar", fr: "Calendrier" },
  "/arae": { en: "Assign", fr: "Désigner" },
  "/copilot": { en: "Copilot", fr: "Copilote" },
  "/referees": { en: "Referees", fr: "Arbitres" },
};

export function MobileNav() {
  const pathname = usePathname();
  const { locale, t } = useLocale();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-ink-1/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {primary.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center gap-1 px-1 py-2 text-[10px]",
              active ? "text-pitch" : "text-chalk-faint",
            )}
          >
            <item.icon size={18} />
            <span className="w-full truncate text-center">
              {shortLabel[item.href]?.[locale] ?? t(item.labelKey)}
            </span>
            <span className={cn("h-0.5 w-5 rounded-full", active ? "bg-pitch" : "bg-transparent")} />
          </Link>
        );
      })}
    </nav>
  );
}
