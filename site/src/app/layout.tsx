import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { ScopeProvider } from "@/lib/scope/ScopeProvider";
import { DatasetProvider } from "@/lib/dataset/DatasetProvider";
import { ToastProvider } from "@/lib/toast/ToastProvider";
import { AppointmentsProvider } from "@/lib/appointments/AppointmentsProvider";
import { ThemeProvider, themeInitScript } from "@/lib/theme/ThemeProvider";

// Headlines and headline figures: a grotesque with ink traps and real weight
// contrast. Body: a quiet humanist sans. Codes and keys: a plain mono.
const display = Bricolage_Grotesque({ variable: "--face-display", subsets: ["latin"], display: "swap" });
const body = Instrument_Sans({ variable: "--face-body", subsets: ["latin"], display: "swap" });
const mono = IBM_Plex_Mono({ variable: "--face-mono", subsets: ["latin"], weight: ["400", "500"], display: "swap" });

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
    <html lang="fr" className={`${display.variable} ${body.variable} ${mono.variable} dark h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full text-chalk">
        <ThemeProvider>
          <LocaleProvider>
            <ToastProvider>
              <DatasetProvider>
                <ScopeProvider>
                  <AppointmentsProvider>{children}</AppointmentsProvider>
                </ScopeProvider>
              </DatasetProvider>
            </ToastProvider>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
