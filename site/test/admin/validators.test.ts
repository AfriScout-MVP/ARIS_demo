import { describe, expect, it } from "vitest";
import {
  isAlpha3,
  isCurrency,
  isEmail,
  isFederationCode,
  isFilled,
  isIso2,
  isPasswordLength,
  isTimeZone,
  normalizeCode,
  parseCapacity,
  validateImage,
} from "@/lib/admin/validators";
import { MAX_IMAGE_BYTES } from "@/lib/admin/constants";

describe("text shapes", () => {
  it("validates e-mail addresses", () => {
    for (const ok of ["a@b.co", "nadia.boukhari@frmf.ma", " padded@x.org "]) expect(isEmail(ok)).toBe(true);
    for (const bad of ["", "plain", "a@b", "a@@b.co", "a b@c.de", "@x.org", "a@.org", "a@b.c"]) expect(isEmail(bad)).toBe(false);
  });

  it("validates ISO codes: upper case only", () => {
    expect(isAlpha3("MAR")).toBe(true);
    expect(isAlpha3("mar")).toBe(false);
    expect(isAlpha3("MA")).toBe(false);
    expect(isAlpha3("MAR1")).toBe(false);
    expect(isIso2("MA")).toBe(true);
    expect(isIso2("MAR")).toBe(false);
    expect(isCurrency("MAD")).toBe(true);
    expect(isCurrency("mad")).toBe(false);
  });

  it("validates federation codes (2 to 20, hyphens inside)", () => {
    for (const ok of ["FRMF", "FAF-AGO", "FA", "A1-B2"]) expect(isFederationCode(ok)).toBe(true);
    for (const bad of ["F", "-FRMF", "frmf", "FR MF", "A".repeat(21)]) expect(isFederationCode(bad)).toBe(false);
  });

  it("normalises codes", () => {
    expect(normalizeCode("  mar ")).toBe("MAR");
  });

  it("checks IANA time zones", () => {
    expect(isTimeZone("Africa/Casablanca")).toBe(true);
    expect(isTimeZone("UTC")).toBe(true);
    expect(isTimeZone("Mars/Olympus")).toBe(false);
    expect(isTimeZone("")).toBe(false);
    expect(isTimeZone(" Africa/Cairo")).toBe(false);
  });

  it("checks password length against the server rule", () => {
    expect(isPasswordLength("a".repeat(11))).toBe(false);
    expect(isPasswordLength("a".repeat(12))).toBe(true);
    expect(isPasswordLength("a".repeat(201))).toBe(false);
  });

  it("isFilled ignores whitespace", () => {
    expect(isFilled("  ")).toBe(false);
    expect(isFilled(" x ")).toBe(true);
  });
});

describe("parseCapacity", () => {
  it("treats empty as no capacity", () => {
    expect(parseCapacity("")).toEqual({ ok: true, value: null });
    expect(parseCapacity("  ")).toEqual({ ok: true, value: null });
  });
  it("accepts whole numbers from 1 to 500 000", () => {
    expect(parseCapacity("45000")).toEqual({ ok: true, value: 45000 });
    expect(parseCapacity("1")).toEqual({ ok: true, value: 1 });
    expect(parseCapacity("500000")).toEqual({ ok: true, value: 500000 });
  });
  it("rejects zero, negatives, decimals, text and excess", () => {
    for (const bad of ["0", "-5", "1.5", "12k", "500001", "1 000"]) expect(parseCapacity(bad).ok).toBe(false);
  });
});

describe("validateImage", () => {
  const png = { type: "image/png", size: 1000 };
  it("accepts PNG, JPEG and WebP up to 8 MB", () => {
    expect(validateImage(png)).toBeNull();
    expect(validateImage({ type: "image/jpeg", size: 1 })).toBeNull();
    expect(validateImage({ type: "image/webp", size: MAX_IMAGE_BYTES })).toBeNull();
  });
  it("rejects other types, SVG included", () => {
    expect(validateImage({ type: "image/svg+xml", size: 10 })).toBe("type");
    expect(validateImage({ type: "image/gif", size: 10 })).toBe("type");
    expect(validateImage({ type: "application/pdf", size: 10 })).toBe("type");
    expect(validateImage({ type: "", size: 10 })).toBe("type");
  });
  it("rejects empty and oversized files", () => {
    expect(validateImage({ type: "image/png", size: 0 })).toBe("empty");
    expect(validateImage({ type: "image/png", size: MAX_IMAGE_BYTES + 1 })).toBe("size");
  });
});
