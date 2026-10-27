"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActor } from "@/lib/admin/hooks";
import { useT, type TKey } from "@/lib/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

interface Section {
  href: string;
  label: TKey;
  roles: Array<"admin" | "federation">;
}

const SECTIONS: Section[] = [
  { href: "/admin/accounts", label: "admin.nav.accounts", roles: ["admin", "federation"] },
  { href: "/admin/partnerships", label: "admin.nav.partnerships", roles: ["admin"] },
  { href: "/admin/federations", label: "admin.nav.federations", roles: ["admin"] },
  { href: "/admin/countries", label: "admin.nav.countries", roles: ["admin"] },
  { href: "/admin/competitions", label: "admin.nav.competitions", roles: ["admin", "federation"] },
  { href: "/admin/teams", label: "admin.nav.teams", roles: ["admin", "federation"] },
  { href: "/admin/grid", label: "admin.nav.grid", roles: ["admin"] },
  { href: "/admin/audit", label: "admin.nav.audit", roles: ["admin", "federation"] },
];

/** The administration sections, as a row of links at the top of every admin page (the sidebar has the same entries). */
export function AdminNav() {
  const t = useT();
  const pathname = usePathname() ?? "";
  const actor = useActor();
  const role = actor?.role;
  if (role !== "admin" && role !== "federation") return null;

  return (
    <nav aria-label={t("admin.nav.label")} className="scroll-x -mx-4 mb-5 px-4 lg:mx-0 lg:px-0">
      <ul className="flex w-max min-w-full gap-1 border-b border-line">
        {SECTIONS.filter((s) => s.roles.includes(role)).map((s) => {
          const current = pathname === s.href || pathname === `${s.href}/`;
          return (
            <li key={s.href}>
              <Link
                href={s.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium transition-colors",
                  current ? "border-red-600 text-chalk" : "border-transparent text-chalk-faint hover:text-chalk",
                )}
              >
                {t(s.label)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
