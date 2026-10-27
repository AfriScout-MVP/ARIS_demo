// Evaluation grid, the platform's default fee scale and the ARPS history — configuration the platform ships with.

import { arpsTrend, competitionById, countries, daysBetween, DEMO_NOW, fixtures } from "../../seed/demo-data";
import { addDays, type SeedContext } from "./context";
import { COUNTRY_REFERENCE } from "./reference";
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

  // The platform default barème, in FCFA. ILLUSTRATIVE — no federation publishes a per-match rate — but sized on
  // public totals: the FSF released 14.26 M FCFA for four LSFP rounds of 2024/25, which puts a crew at roughly
  // 220 000–450 000 FCFA a match. Each federation sets its own scale in its own currency.
  const base: Record<string, number> = { R: 60000, AR1: 40000, AR2: 40000, FOURTH: 30000, VAR: 45000, AVAR: 30000, OBS: 40000 };
  const tierFactor: Record<string, number> = { d1: 1, d2: 0.7, cup: 1.1, continental: 2.5 };
  const feeRows: Cell[][] = [];
  for (const [tier, factor] of Object.entries(tierFactor)) {
    for (const [role, amount] of Object.entries(base)) {
      feeRows.push([`fs-${tier}-${role}`, tier, role, Math.round((amount * factor) / 500) * 500, tier === "continental" ? 25000 : 10000, tier === "continental" ? 20000 : 0, 5000, "XOF"]);
    }
  }
  out.insert("fee_scales", ["id", "tier", "role", "amount", "transport", "lodging", "meals", "currency"], feeRows);

  // ARIS never converts a currency, so a federation paid in anything but FCFA needs a scale of its own or no fee can
  // be worked out. Each one gets the default barème re-expressed in its currency at an ILLUSTRATIVE rate (FCFA per
  // unit, rounded) — demo figures for the federation to replace, not exchange data. FCFA federations keep the default.
  const own: Cell[][] = [];
  for (const c of countries) {
    const currency = COUNTRY_REFERENCE[c.code].currency;
    if (currency === "XOF") continue;
    const rate = ILLUSTRATIVE_XOF_PER_UNIT[currency];
    if (!rate) throw new Error(`No illustrative rate for ${currency}`);
    const local = (xof: number) => roundNicely(xof / rate);
    for (const [tier, factor] of Object.entries(tierFactor)) {
      if (tier === "continental") continue; // continental ties are paid by the confederation, on the default
      for (const [role, amount] of Object.entries(base)) {
        own.push([`fs-${c.code}-${tier}-${role}`, tier, `fed-${c.code}`, role, local(amount * factor), local(10000), 0, local(5000), currency]);
      }
    }
  }
  out.insert("fee_scales", ["id", "tier", "federation_id", "role", "amount", "transport", "lodging", "meals", "currency"], own);

  // Payment lines for the domestic matches already played, as the federation's finance desk would have them: paid
  // after about three weeks, validated after one, due before that, and the odd line contested. Amounts come from the
  // scale the API itself would pick (the federation's own, else the default) — continental ties are the
  // confederation's to pay, so they have no line here.
  const scaleRow = new Map<string, Cell[]>();
  for (const row of feeRows) scaleRow.set(`|${row[1]}|${row[2]}`, row);
  for (const row of own) scaleRow.set(`${row[2]}|${row[1]}|${row[3]}`, row);
  const pick = (code: string, tier: string, role: string) => {
    const mine = scaleRow.get(`fed-${code}|${tier}|${role}`);
    if (mine) return { amount: mine[4] as number, transport: mine[5] as number, lodging: mine[6] as number, meals: mine[7] as number, currency: mine[8] as string };
    const d = scaleRow.get(`|${tier}|${role}`)!;
    return { amount: d[3] as number, transport: d[4] as number, lodging: d[5] as number, meals: d[6] as number, currency: d[7] as string };
  };
  const hashOf = (str: string) => [...str].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261);
  const payRows: Cell[][] = [];
  for (const f of fixtures.filter((x) => x.played && x.countryCode !== "CAF")) {
    const tier = competitionById.get(f.competitionId)!.tier;
    const age = daysBetween(f.date, DEMO_NOW);
    for (const slot of f.crew.filter((x) => x.officialId && x.state === "confirmed")) {
      const sc = pick(f.countryCode, tier, slot.role);
      const roll = hashOf(`${f.id}|${slot.role}`) % 100;
      const status = roll < 2 ? "contested" : age >= 21 ? "paid" : age >= 8 ? "validated" : "due";
      const checked = status === "paid" || status === "validated";
      const validatedAt = checked ? `${ctx.sh(addDays(f.date, 5))}T10:00:00.000Z` : null;
      const paidAt = status === "paid" ? `${ctx.sh(addDays(f.date, 18))}T11:30:00.000Z` : null;
      const fed = countries.find((c) => c.code === f.countryCode)!.federation;
      payRows.push([
        `pay-${f.id}-${slot.role}`.toLowerCase(), f.id, slot.role, slot.officialId, sc.amount, sc.transport, sc.lodging, sc.meals, sc.currency, status,
        checked || status === "contested", checked, checked, validatedAt, paidAt, status === "paid" ? `VIR-${fed}-${ctx.sh(f.date).slice(0, 7).replace("-", "")}-${String(roll).padStart(3, "0")}` : null,
        status === "contested" ? "Frais de transport non pris en compte : déplacement aller-retour en bus interurbain." : null,
      ]);
    }
  }
  out.insert(
    "payments",
    ["id", "fixture_id", "role", "official_id", "base", "transport", "lodging", "meals", "currency", "status", "presence_confirmed", "match_validated", "expenses_verified", "validated_at", "paid_at", "payment_ref", "contest_note"],
    payRows,
  );

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

/** FCFA per unit of each currency the demo countries pay in — rounded, illustrative, for seeding only. */
const ILLUSTRATIVE_XOF_PER_UNIT: Record<string, number> = {
  XAF: 1, EGP: 12, MAD: 62, TND: 195, DZD: 4.5, GHS: 50, NGN: 0.4, CDF: 0.21, KES: 4.6, TZS: 0.23,
  UGX: 0.16, BIF: 0.2, ZAR: 33, ZMW: 23, ZWG: 22, BWP: 44, AOA: 0.65,
};

/** Two significant figures, so a converted fee reads like one a federation would set (320, 4 500, 1 300 000). */
function roundNicely(n: number) {
  if (n < 10) return Math.max(1, Math.round(n));
  const step = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / step) * step;
}
