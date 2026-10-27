import { describe, expect, it } from "vitest";
import { appendPage, checkNewPassword, cleanName, isDeadLink, notificationsHref, readResetToken, recoveryProblem } from "@/lib/account/rules";
import { ApiError, NetworkError } from "@/lib/api/client";

const TOKEN = "Abc-def_ghiJKLmnopQRSTuvwxyz0123456789ABCDE"; // 43 characters, base64url

describe("reset link token", () => {
  it("reads the token from the query string, with or without the question mark", () => {
    expect(readResetToken(`?token=${TOKEN}`)).toBe(TOKEN);
    expect(readResetToken(`token=${TOKEN}&utm=x`)).toBe(TOKEN);
  });

  it("refuses a missing, short or mangled token", () => {
    expect(readResetToken("")).toBeNull();
    expect(readResetToken("?token=")).toBeNull();
    expect(readResetToken("?token=short")).toBeNull();
    expect(readResetToken(`?token=${TOKEN.slice(0, 10)}<script>`)).toBeNull();
    expect(readResetToken(`?token=${"a".repeat(201)}`)).toBeNull();
  });
});

describe("new password checks", () => {
  it("applies the 12-character policy and the confirmation", () => {
    expect(checkNewPassword("short", "short")).toEqual({ next: "short", confirm: null });
    expect(checkNewPassword("long-enough-pass", "different-pass")).toEqual({ next: null, confirm: "mismatch" });
    expect(checkNewPassword("long-enough-pass", "long-enough-pass")).toEqual({ next: null, confirm: null });
    expect(checkNewPassword("x".repeat(201), "x".repeat(201)).next).toBe("short");
  });

  it("refuses keeping the given password when it is known", () => {
    expect(checkNewPassword("the-given-password", "the-given-password", "the-given-password").next).toBe("same");
  });
});

describe("recovery errors", () => {
  it("tells throttling, network and other failures apart, per screen", () => {
    expect(recoveryProblem(new ApiError(429, "too_many_attempts", "x"), "forgot")).toBe("account.forgot.throttled");
    expect(recoveryProblem(new NetworkError(), "reset")).toBe("account.reset.network");
    expect(recoveryProblem(new ApiError(500, "internal_error", "x"), "reset")).toBe("account.reset.failed");
  });

  it("recognises a dead link", () => {
    expect(isDeadLink(new ApiError(400, "invalid_token", "x"))).toBe(true);
    expect(isDeadLink(new ApiError(422, "validation_failed", "x"))).toBe(false);
  });
});

describe("notifications page", () => {
  it("appends older pages without repeating an item", () => {
    expect(appendPage([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }]).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("sends referees to their own space's page", () => {
    expect(notificationsHref("referee")).toBe("/me/notifications");
    expect(notificationsHref("admin")).toBe("/notifications");
    expect(notificationsHref("federation")).toBe("/notifications");
  });
});

describe("display name", () => {
  it("trims and bounds it", () => {
    expect(cleanName("  Awa Diallo ")).toBe("Awa Diallo");
    expect(cleanName("   ")).toBeNull();
    expect(cleanName("x".repeat(121))).toBeNull();
  });
});
