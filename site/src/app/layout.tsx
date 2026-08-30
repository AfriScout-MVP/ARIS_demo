import type { Metadata, Viewport } from "next";
import { Archivo, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { ScopeProvider } from "@/lib/scope/ScopeProvider";
import { AppointmentsProvider } from "@/lib/appointments/AppointmentsProvider";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ARIS — Système africain d'intelligence de l'arbitrage",
  description:
    "ARIS pilote l'arbitrage des fédérations africaines : calendriers nationaux, désignations des trios, notation des performances, rapports d'observateur et suivi du développement.",
};

export const viewport: Viewport = {
  themeColor: "#08090a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="fr"
      className={`${inter.variable} ${archivo.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-ink-0 text-chalk">
        <LocaleProvider>
          <ScopeProvider>
            <AppointmentsProvider>{children}</AppointmentsProvider>
          </ScopeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
