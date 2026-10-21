import { MAX_PASSWORD, MIN_PASSWORD } from "./constants";

export type StrengthLevel = "empty" | "short" | "weak" | "fair" | "good" | "strong";

export interface Strength {
  /** 0 (empty / too short) to 4 (strong). */
  score: 0 | 1 | 2 | 3 | 4;
  level: StrengthLevel;
  /** Meets the only rule the server enforces: at least 12 characters. */
  ok: boolean;
}

const COMMON = ["password", "motdepasse", "azerty", "qwerty", "123456", "654321", "admin", "welcome", "bienvenue", "football", "caf2", "letmein"];

function hasSequence(pw: string): boolean {
  const lower = pw.toLowerCase();
  let run = 1;
  for (let i = 1; i < lower.length; i++) {
    const step = lower.charCodeAt(i) - lower.charCodeAt(i - 1);
    run = step === 1 || step === -1 ? run + 1 : 1;
    if (run >= 6) return true;
  }
  return false;
}

/** A hint, not a gate: the length is the only thing the server checks. */
export function passwordStrength(pw: string): Strength {
  if (pw.length === 0) return { score: 0, level: "empty", ok: false };
  if (pw.length < MIN_PASSWORD) return { score: 0, level: "short", ok: false };

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(pw)).length;
  const lower = pw.toLowerCase();
  const common = COMMON.some((word) => lower.includes(word));
  const distinct = new Set(pw).size;

  let points = classes;
  if (pw.length >= 16) points += 1;
  if (pw.length >= 24) points += 1;
  if (common) points -= 3;
  if (distinct <= 4 || hasSequence(pw)) points -= 2;

  if (points <= 2) return { score: 1, level: "weak", ok: true };
  if (points === 3) return { score: 2, level: "fair", ok: true };
  if (points === 4) return { score: 3, level: "good", ok: true };
  return { score: 4, level: "strong", ok: true };
}

const LOWER = "abcdefghijkmnopqrstuvwxyz"; // no l
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I, O
const DIGITS = "23456789"; // no 0, 1
const SYMBOLS = "!@#$%&*-_=+?";

export type FillRandom = (buffer: Uint32Array) => Uint32Array;

const browserFill: FillRandom = (buffer) => globalThis.crypto.getRandomValues(buffer);

/** Uniform integer in [0, max) by rejection sampling, so no character is more likely than another. */
export function randomInt(max: number, fill: FillRandom = browserFill): number {
  if (!Number.isInteger(max) || max < 1 || max > 0xffffffff) throw new RangeError("max out of range");
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  for (;;) {
    fill(buffer);
    if (buffer[0] < limit) return buffer[0] % max;
  }
}

/** A random password with at least one lower-case, upper-case, digit and symbol; ambiguous glyphs left out. */
export function generatePassword(length = 16, fill: FillRandom = browserFill): string {
  const size = Math.min(Math.max(Math.trunc(length), MIN_PASSWORD), MAX_PASSWORD);
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  const pick = (set: string) => set[randomInt(set.length, fill)];

  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < size) chars.push(pick(all));

  // Fisher-Yates, so the guaranteed characters are not always at the front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1, fill);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
