import { describe, expect, it } from "vitest";
import { pickLocalized, type LocalizedText } from "@/lib/i18n/localized";

const full: LocalizedText = { fr: "Bonjour", en: "Hello", es: "Hola", de: "Hallo" };

describe("pickLocalized", () => {
  it("returns the requested locale when present", () => {
    expect(pickLocalized(full, "es")).toBe("Hola");
    expect(pickLocalized(full, "de")).toBe("Hallo");
    expect(pickLocalized(full, "en")).toBe("Hello");
    expect(pickLocalized(full, "fr")).toBe("Bonjour");
  });

  it("falls back to fr, then en, when the locale is missing or empty", () => {
    expect(pickLocalized({ fr: "Bonjour", en: "Hello" }, "de")).toBe("Bonjour");
    expect(pickLocalized({ fr: "Bonjour", en: "Hello", es: "" }, "es")).toBe("Bonjour");
    expect(pickLocalized({ fr: "  ", en: "Hello" }, "es")).toBe("Hello");
    expect(pickLocalized({ en: "Hello" }, "de")).toBe("Hello");
  });

  it("falls back to the first non-empty value, then to the empty string", () => {
    expect(pickLocalized({ de: "Hallo" }, "es")).toBe("Hallo");
    expect(pickLocalized({ es: "", de: "Hallo" }, "fr")).toBe("Hallo");
    expect(pickLocalized({ fr: "", en: "" }, "fr")).toBe("");
    expect(pickLocalized({}, "fr")).toBe("");
  });

  it("tolerates null and undefined", () => {
    expect(pickLocalized(null, "fr")).toBe("");
    expect(pickLocalized(undefined, "de")).toBe("");
  });
});
