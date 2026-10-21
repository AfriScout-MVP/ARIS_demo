// Evaluation grid, the platform's default fee scale and the ARPS history — configuration the platform ships with.

import { arpsTrend } from "../../seed/demo-data";
import type { SeedContext } from "./context";
import { jsonCell, type Cell } from "./sql";

export function writeConfiguration(ctx: SeedContext) {
  const out = ctx.sql.section("finance");

  // weights from the federation brief, mapped onto ARIS's six marks (they total 100)
  out.insert("evaluation_criteria", ["key", "label", "weight", "sort"], [
    ["positioning", jsonCell({ fr: "Positionnement et déplacements", en: "Positioning and movement", es: "Colocación y desplazamientos", de: "Stellungsspiel und Laufwege" }), 20, 0],
    ["decisions", jsonCell({ fr: "Interprétation des lois du jeu", en: "Interpretation of the Laws of the Game", es: "Interpretación de las Reglas de Juego", de: "Auslegung der Fußballregeln" }), 25, 1],
    ["gameManagement", jsonCell({ fr: "Cohérence des décisions", en: "Consistency of decisions", es: "Coherencia de las decisiones", de: "Konsequenz der Entscheidungen" }), 20, 2],
    ["discipline", jsonCell({ fr: "Gestion disciplinaire", en: "Disciplinary management", es: "Gestión disciplinaria", de: "Disziplinarisches Management" }), 15, 3],
    ["teamwork", jsonCell({ fr: "Communication et autorité", en: "Communication and authority", es: "Comunicación y autoridad", de: "Kommunikation und Autorität" }), 10, 4],
    ["fitness", jsonCell({ fr: "Condition physique et gestion du match", en: "Fitness and match management", es: "Condición física y gestión del partido", de: "Fitness und Spielleitung" }), 10, 5],
  ]);

  // The platform default barème, in FCFA. ILLUSTRATIVE: each federation sets its own scale in its own currency.
  const base: Record<string, number> = { R: 20000, AR1: 12000, AR2: 12000, FOURTH: 10000, VAR: 15000, AVAR: 10000, OBS: 15000 };
  const tierFactor: Record<string, number> = { d1: 1, d2: 0.7, cup: 1.1, continental: 2.5 };
  const feeRows: Cell[][] = [];
  for (const [tier, factor] of Object.entries(tierFactor)) {
    for (const [role, amount] of Object.entries(base)) {
      feeRows.push([`fs-${tier}-${role}`, tier, role, Math.round((amount * factor) / 500) * 500, tier === "continental" ? 25000 : 2000, tier === "continental" ? 20000 : 0, 5000, "XOF"]);
    }
  }
  out.insert("fee_scales", ["id", "tier", "role", "amount", "transport", "lodging", "meals", "currency"], feeRows);

  // monthly continental average, oldest first, ending in the anchor's month; the daily job extends it from here
  const [year, month] = ctx.anchor.split("-").map(Number);
  out.insert(
    "performance_history",
    ["month", "country_code", "avg_arps", "officials"],
    arpsTrend.map((p, i) => {
      const back = arpsTrend.length - 1 - i;
      const d = new Date(Date.UTC(year, month - 1 - back, 1));
      return [`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, "", p.score, 0];
    }),
  );
}
