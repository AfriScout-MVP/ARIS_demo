import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Federations, Figures, Landing } from "@/components/landing/Landing";
import type { PublicSummary } from "@/lib/landing/federations";
import { LazyMotion, domAnimation } from "framer-motion";
import { LoadingScreen } from "@/components/icons/MarkLoader";
import { DatasetProvider } from "@/lib/dataset/DatasetProvider";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import { dictionaries } from "@/locales";

const render = () =>
  renderToString(createElement(ThemeProvider, null, createElement(LocaleProvider, null, createElement(DatasetProvider, null, createElement(Landing)))));

describe("landing page", () => {
  const html = render();
  const fr = dictionaries.fr.landing;

  it("renders every section without leaking a raw translation key", () => {
    expect(html).not.toMatch(/landing\.[a-z]+\.[a-zA-Z.]+/);
    for (const id of ["modules", "workflow", "roles", "security"]) expect(html).toContain(`id="${id}"`);
  });

  it("carries the French copy of each block", () => {
    for (const text of [fr.hero.lead, fr.modules.title, fr.workflow.title, fr.roles.title, fr.security.title, fr.cta.title]) {
      expect(html).toContain(text.replace(/'/g, "&#x27;"));
    }
  });

  it("draws the live pitch with both teams, the referee and both assistants", () => {
    expect(html.match(/data-home="true"/g)).toHaveLength(11);
    expect(html.match(/data-away="true"/g)).toHaveLength(11);
    for (const a of ["data-ref", "data-ar1", "data-ar2", "data-ball"]) expect(html).toContain(a);
  });

  it("shows no country or figure until the public summary has loaded", () => {
    expect(html).not.toContain(fr.federations.lead.replace(/'/g, "&#x27;"));
    expect(html).not.toContain(fr.stats.officials);
  });
});

describe("landing live sections", () => {
  const summary: PublicSummary = {
    countries: [
      { code: "CIV", iso2: "CI", name: "Ivory Coast", nameFr: "Côte d'Ivoire", nameEs: "Costa de Marfil", nameDe: "Elfenbeinküste", flagUrl: "/api/v1/media/flag-ci", federation: "FIF", federationName: "Fédération Ivoirienne de Football" },
      { code: "COG", iso2: "CG", name: "Congo", nameFr: "Congo", nameEs: "Congo", nameDe: "Kongo", flagUrl: null, federation: "FECOFOOT", federationName: null },
    ],
    figures: { countries: 2, officials: 57, competitions: 4, criteria: 6 },
  };
  const wrap = (el: ReturnType<typeof createElement>) =>
    renderToString(createElement(ThemeProvider, null, createElement(LocaleProvider, null, createElement(LazyMotion, { features: domAnimation }, el))));

  it("lists each live federation with its flag, its name in the visitor's language and its code", () => {
    const html = wrap(createElement(Federations, { summary }));
    expect(html).toContain("/api/v1/media/flag-ci");
    expect(html).toContain("Côte d&#x27;Ivoire");
    expect(html).toContain("FECOFOOT");
    expect(html).toContain(">CG<"); // no flag on record: the ISO code stands in
    expect(html).toContain(dictionaries.fr.landing.federations.title.replace("{count}", "2"));
  });

  it("shows the live counts", () => {
    const html = wrap(createElement(Figures, { summary }));
    for (const v of [">2<", ">57<", ">4<", ">6<"]) expect(html).toContain(v);
  });
});

describe("loading screen", () => {
  it("draws the live mark with a status line", () => {
    const html = renderToString(createElement(LoadingScreen, { label: "Chargement…" }));
    expect(html).toContain('role="status"');
    for (const part of ["ld-a", "ld-diag", "ld-ball", "ld-ripple"]) expect(html).toContain(part);
  });
});
