"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { usePersistent, writeStore } from "@/lib/persistent-store";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { ScopeSelect } from "./ScopeSelect";
import { CommandPalette } from "./CommandPalette";

const SIDEBAR_KEY = "aris.nav";

/** Open unless the visitor closed it — the admin's default. */
const parseOpen = (raw: string | null) => raw !== "closed";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const desktopOpen = usePersistent(SIDEBAR_KEY, parseOpen, true);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const toggleDesktop = () => writeStore(SIDEBAR_KEY, desktopOpen ? "closed" : "open");

  return (
    <div className="min-h-screen bg-ink-0">
      <Sidebar
        desktopOpen={desktopOpen}
        mobileOpen={mobileOpen}
        onToggleDesktop={toggleDesktop}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className={cn("min-h-screen transition-all duration-300", desktopOpen ? "lg:pl-64" : "lg:pl-0")}>
        <Topbar
          onOpenPalette={() => setPaletteOpen(true)}
          onOpenMobileNav={() => setMobileOpen(true)}
          desktopOpen={desktopOpen}
          onOpenDesktop={toggleDesktop}
        />
        <main className="mx-auto w-full max-w-screen-2xl p-4 pt-20 lg:p-6">
          <div className="mb-4 lg:hidden">
            <ScopeSelect />
          </div>
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
