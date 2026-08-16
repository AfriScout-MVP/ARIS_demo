"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { navItems } from "./nav-items";

const primary = navItems.slice(0, 5);

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-aris-border bg-aris-bg-2/95 backdrop-blur px-1 py-2 flex justify-between">
      {primary.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 rounded-lg py-1.5 text-[10px]",
              active ? "text-aris-emerald-light" : "text-aris-muted",
            )}
          >
            <item.icon size={18} />
            <span className="truncate max-w-[64px]">{item.label.split(" ")[0]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
