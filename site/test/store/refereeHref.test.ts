import { describe, expect, it } from "vitest";
import { refereeHref } from "@/lib/store";

describe("refereeHref", () => {
  it("points at the single static profile page with the id as a query", () => {
    expect(refereeHref("abc-1")).toBe("/referees/profile?id=abc-1");
  });

  it("escapes anything that would break out of the query string", () => {
    expect(refereeHref("a b&c=d/é")).toBe("/referees/profile?id=a%20b%26c%3Dd%2F%C3%A9");
    const id = new URL(refereeHref("a b&c=d"), "http://x").searchParams.get("id");
    expect(id).toBe("a b&c=d");
  });
});
