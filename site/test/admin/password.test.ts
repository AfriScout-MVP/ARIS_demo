import { describe, expect, it } from "vitest";
import { generatePassword, passwordStrength, randomInt, type FillRandom } from "@/lib/admin/password";
import { MIN_PASSWORD } from "@/lib/admin/constants";

/** A deterministic stand-in for crypto.getRandomValues (xorshift), so the generator can be tested exactly. */
function seeded(seed: number): FillRandom {
  let x = seed >>> 0 || 1;
  return (buffer) => {
    for (let i = 0; i < buffer.length; i++) {
      x ^= x << 13;
      x >>>= 0;
      x ^= x >>> 17;
      x ^= x << 5;
      x >>>= 0;
      buffer[i] = x;
    }
    return buffer;
  };
}

describe("passwordStrength", () => {
  it("is empty, then too short below 12 characters", () => {
    expect(passwordStrength("")).toMatchObject({ level: "empty", ok: false, score: 0 });
    expect(passwordStrength("Abcd1234!")).toMatchObject({ level: "short", ok: false, score: 0 });
    expect(passwordStrength("a".repeat(MIN_PASSWORD - 1)).ok).toBe(false);
  });

  it("accepts exactly 12 characters (the server's only rule)", () => {
    expect(passwordStrength("Tz7!kQ2#mW9x").ok).toBe(true);
    expect(passwordStrength("a".repeat(MIN_PASSWORD)).ok).toBe(true);
  });

  it("rates repeated, sequential and common passwords as weak", () => {
    expect(passwordStrength("aaaaaaaaaaaa").level).toBe("weak");
    expect(passwordStrength("abcdefghijkl").level).toBe("weak");
    expect(passwordStrength("Password1234!").level).toBe("weak");
  });

  it("rates long mixed passwords as strong", () => {
    expect(passwordStrength("correct-Horse-battery9").level).toBe("strong");
    expect(passwordStrength("correct-Horse-battery9").score).toBe(4);
  });

  it("climbs with length and variety", () => {
    const a = passwordStrength("kqmwzxvbnmlp").score; // 12 lower-case
    const b = passwordStrength("Kqmwzxvbnm7p").score; // + upper, digit
    const c = passwordStrength("Kqmwzxv-bnm7pRtsy").score; // + symbol, 16+
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThanOrEqual(c);
  });
});

describe("generatePassword", () => {
  it("honours the requested length, clamped to 12..200", () => {
    expect(generatePassword(16)).toHaveLength(16);
    expect(generatePassword(4)).toHaveLength(12);
    expect(generatePassword(1000)).toHaveLength(200);
  });

  it("always has a lower-case letter, an upper-case letter, a digit and a symbol", () => {
    for (let i = 1; i <= 50; i++) {
      const pw = generatePassword(12, seeded(i));
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[2-9]/);
      expect(pw).toMatch(/[^A-Za-z0-9]/);
    }
  });

  it("leaves out look-alike characters", () => {
    for (let i = 1; i <= 50; i++) expect(generatePassword(40, seeded(i))).not.toMatch(/[Il O01]/);
  });

  it("is reproducible with the same randomness and different with another", () => {
    expect(generatePassword(20, seeded(7))).toBe(generatePassword(20, seeded(7)));
    expect(generatePassword(20, seeded(7))).not.toBe(generatePassword(20, seeded(8)));
  });

  it("uses the platform's crypto by default and passes the server rule", () => {
    const pw = generatePassword();
    expect(pw.length).toBeGreaterThanOrEqual(MIN_PASSWORD);
    expect(passwordStrength(pw).ok).toBe(true);
    expect(generatePassword()).not.toBe(pw);
  });
});

describe("randomInt", () => {
  it("stays in range and rejects the biased tail", () => {
    const rolls = Array.from({ length: 300 }, (_, i) => randomInt(6, seeded(i + 1)));
    expect(Math.min(...rolls)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...rolls)).toBeLessThan(6);
    // 0xffffffff is above the largest multiple of 6 below 2^32, so it must be skipped.
    const feed = [0xffffffff, 7];
    const fill: FillRandom = (b) => ((b[0] = feed.shift() ?? 0), b);
    expect(randomInt(6, fill)).toBe(1);
  });

  it("rejects an invalid bound", () => {
    expect(() => randomInt(0)).toThrow(RangeError);
    expect(() => randomInt(1.5)).toThrow(RangeError);
  });
});
