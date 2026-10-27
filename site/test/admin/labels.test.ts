import { describe, expect, it } from "vitest";
import { locales } from "@/locales";
import { ADMIN_ROLES, TEAM_KINDS, ZONES } from "@/lib/admin/constants";
import { countryLabel, federationStatusKey, roleLabelKey, roleTone, teamKindKey, translateOr, zoneLabelKey } from "@/lib/admin/labels";
import { translate } from "@/lib/i18n/translate";
import type { TKey } from "@/locales";

const t = (locale: (typeof locales)[number]) => (key: TKey) => translate(locale, key);

describe("role labels", () => {
  it("reads Super-admin / Fédération / Arbitre / Taggeur in French", () => {
    expect(ADMIN_ROLES.map((r) => t("fr")(roleLabelKey(r)))).toEqual(["Super-admin", "Fédération", "Arbitre", "Taggeur"]);
  });
  it("reads Super-admin / Federation / Referee / Tagger in English", () => {
    expect(ADMIN_ROLES.map((r) => t("en")(roleLabelKey(r)))).toEqual(["Super-admin", "Federation", "Referee", "Tagger"]);
  });
  it("reads the Spanish and German names", () => {
    expect(ADMIN_ROLES.map((r) => t("es")(roleLabelKey(r)))).toEqual(["Superadministrador", "Federación", "Árbitro", "Etiquetador"]);
    expect(ADMIN_ROLES.map((r) => t("de")(roleLabelKey(r)))).toEqual(["Superadministrator", "Verband", "Schiedsrichter", "Tagger"]);
  });
  it("gives each role its own tone", () => {
    expect(new Set(ADMIN_ROLES.map(roleTone)).size).toBe(4);
  });
});

describe("label keys resolve in every language", () => {
  const keys: TKey[] = [
    ...ZONES.map(zoneLabelKey),
    ...TEAM_KINDS.map(teamKindKey),
    federationStatusKey("active"),
    federationStatusKey("suspended"),
  ];
  it.each(locales)("%s", (locale) => {
    for (const key of keys) expect(translate(locale, key), key).not.toBe(key);
  });
});

describe("translateOr", () => {
  const fr = t("fr");
  it("uses the translation when there is one and the fallback otherwise", () => {
    expect(translateOr(fr, "admin.audit.entities.team", "x")).toBe("Équipe");
    expect(translateOr(fr, "admin.audit.entities.zebra", "zebra")).toBe("zebra");
  });
});

describe("countryLabel", () => {
  const morocco = { code: "MAR", name: "Morocco", nameFr: "Maroc", nameEs: "Marruecos", nameDe: "Marokko" };
  it("picks the language of the visitor", () => {
    expect(countryLabel(morocco, "fr")).toBe("Maroc");
    expect(countryLabel(morocco, "en")).toBe("Morocco");
    expect(countryLabel(morocco, "es")).toBe("Marruecos");
    expect(countryLabel(morocco, "de")).toBe("Marokko");
  });
  it("falls back to French, English, then the code", () => {
    expect(countryLabel({ code: "MAR", name: "Morocco", nameFr: "Maroc" }, "de")).toBe("Maroc");
    expect(countryLabel({ code: "MAR", name: "Morocco" }, "es")).toBe("Morocco");
    expect(countryLabel({ code: "MAR" }, "fr")).toBe("MAR");
    expect(countryLabel(undefined, "fr", "—")).toBe("—");
  });
});
