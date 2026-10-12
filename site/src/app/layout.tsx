import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { ScopeProvider } from "@/lib/scope/ScopeProvider";
import { AppointmentsProvider } from "@/lib/appointments/AppointmentsProvider";
import { ThemeProvider, themeInitScript } from "@/lib/theme/ThemeProvider";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "ARIS — Système africain d'intelligence de l'arbitrage",
  description:
    "ARIS pilote l'arbitrage des fédérations africaines : calendriers nationaux, désignations des trios, notation des performances, rapports d'observateur et suivi du développement.",
};

export const viewport: Viewport = {
  themeColor: "#020617",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `dark` is the server default; themeInitScript removes it before first
    // paint when the visitor chose light, hence suppressHydrationWarning.
    <html lang="fr" className={`${inter.variable} dark h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full bg-ink-0 text-chalk">
        <ThemeProvider>
          <LocaleProvider>
            <ScopeProvider>
              <AppointmentsProvider>{children}</AppointmentsProvider>
            </ScopeProvider>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
