"use client";

import { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import { usePersistent, writeStore } from "@/lib/persistent-store";

export type Theme = "light" | "dark";

export const THEME_KEY = "aris.theme";

/** Dark is the default, as it is in AfriScout. */
const parseTheme = (raw: string | null): Theme => (raw === "light" ? "light" : "dark");

/**
 * Runs in <head> before first paint, so a stored light theme never flashes
 * dark. The provider below keeps the class in step after hydration.
 */
export const themeInitScript = `try{if(localStorage.getItem("${THEME_KEY}")==="light"){document.documentElement.classList.remove("dark")}}catch(e){}`;

interface ThemeContextValue {
  theme: Theme;
  setTheme: (next: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = usePersistent(THEME_KEY, parseTheme, "dark");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const setTheme = useCallback((next: Theme) => writeStore(THEME_KEY, next), []);
  const toggle = useCallback(() => writeStore(THEME_KEY, theme === "dark" ? "light" : "dark"), [theme]);

  const value = useMemo(() => ({ theme, setTheme, toggle }), [theme, setTheme, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
