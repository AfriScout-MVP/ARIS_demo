import { describe, expect, it } from "vitest";
import {
  defaultLocale,
  dictionaries,
  isLocale,
  localeCodes,
  localeLabels,
  localeTags,
  locales,
} from "@/locales";
import { interpolate, lookup, parseLocale, translate } from "@/lib/i18n/translate";
import { flat } from "./helpers";

describe("locale registry", () => {
  it("lists fr, en, es, de in that order and defaults to fr", () => {
    expect([...locales]).toEqual(["fr", "en", "es", "de"]);
    expect(defaultLocale).toBe("fr");
  });

  it("has a dictionary, label, short code and tag for every locale", () => {
    for (const l of locales) {
      expect(Object.keys(dictionaries[l]).length).toBeGreaterThan(15);
      expect(localeLabels[l]).toBeTruthy();
      expect(localeCodes[l]).toBe(l.toUpperCase());
      expect(localeTags[l]).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
    }
  });

  it("labels are the native names, with accents", () => {
    expect(localeLabels).toEqual({ fr: "Français", en: "English", es: "Español", de: "Deutsch" });
    expect(localeTags).toEqual({ fr: "fr-FR", en: "en-GB", es: "es-ES", de: "de-DE" });
  });

  it("merges the namespaces under their file name, keys unchanged", () => {
    const fr = flat("fr");
    expect(fr["common.appName"]).toBe("ARIS");
    expect(fr["auth.role.admin"]).toBe("Super-admin");
    expect(flat("en")["nav.copilot"]).toBe("Quick answers");
    expect(flat("es")["status.atRisk"]).toBe("En riesgo");
    expect(flat("de")["roles.FOURTH"]).toBe("Vierter Offizieller");
  });

  it("isLocale / parseLocale accept the four locales and default everything else to fr", () => {
    for (const l of locales) {
      expect(isLocale(l)).toBe(true);
      expect(parseLocale(l)).toBe(l);
    }
    for (const bad of [null, undefined, "", "pt", "FR", "fr-FR", "en_GB"]) {
      expect(isLocale(bad)).toBe(false);
      expect(parseLocale(bad as string | null)).toBe("fr");
    }
  });
});

describe("translate()", () => {
  it("returns the text of the requested locale", () => {
    expect(translate("fr", "common.signOut")).toBe("Se déconnecter");
    expect(translate("en", "common.signOut")).toBe("Sign out");
    expect(translate("es", "common.signOut")).toBe("Cerrar sesión");
    expect(translate("de", "common.signOut")).toBe("Abmelden");
  });

  it("interpolates {placeholders} and leaves unknown ones in place", () => {
    expect(translate("fr", "auth.signedInAs", { name: "Nadia" })).toBe("Connecté en tant que Nadia");
    expect(translate("de", "calendar.autoFillDone", { n: 3 })).toContain("3 Positionen");
    expect(translate("es", "auth.signedInAs")).toBe("Sesión iniciada como {name}");
    expect(interpolate("{a} and {b}", { a: 1 })).toBe("1 and {b}");
  });

  it("falls back to the key itself when nothing knows it", () => {
    for (const l of locales) expect(translate(l, "does.not.exist")).toBe("does.not.exist");
    expect(translate("fr", "common")).toBe("common"); // a branch, not a leaf
  });

  it("falls back to fr when the requested locale lacks the key", () => {
    // Simulate a gap in `es` without touching the shipped data.
    const es = dictionaries.es as unknown as { common: Record<string, string> };
    const original = es.common.signOut;
    delete (es.common as Record<string, string | undefined>).signOut;
    try {
      expect(translate("es", "common.signOut")).toBe("Se déconnecter");
    } finally {
      es.common.signOut = original;
    }
    expect(translate("es", "common.signOut")).toBe("Cerrar sesión");
  });

  it("lookup() only returns string leaves", () => {
    expect(lookup(dictionaries.fr, "common.appName")).toBe("ARIS");
    expect(lookup(dictionaries.fr, "common")).toBeUndefined();
    expect(lookup(dictionaries.fr, "common.appName.deeper")).toBeUndefined();
  });
});
