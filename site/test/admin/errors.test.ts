import { describe, expect, it } from "vitest";
import { ApiError, NetworkError } from "@/lib/api/client";
import { describeError, fieldErrorsFrom } from "@/lib/admin/errors";
import { locales } from "@/locales";
import { translate } from "@/lib/i18n/translate";

describe("describeError", () => {
  it("maps the codes the console must word itself", () => {
    expect(describeError(new ApiError(409, "email_taken", "x")).key).toBe("admin.errors.email_taken");
    expect(describeError(new ApiError(409, "last_admin", "x")).key).toBe("admin.errors.last_admin");
    expect(describeError(new ApiError(409, "official_has_account", "x")).key).toBe("admin.errors.official_taken");
    expect(describeError(new ApiError(409, "federation_exists", "x")).key).toBe("admin.errors.country_taken");
  });

  it("turns validation_failed details into per-field messages", () => {
    const info = describeError(
      new ApiError(422, "validation_failed", "x", [
        { path: "password", message: "Use at least 12 characters" },
        { path: "email", message: "Invalid" },
        { path: "federation.code", message: "Invalid" },
      ]),
    );
    expect(info.key).toBe("admin.errors.validation_failed");
    expect(info.fields).toEqual({
      password: "admin.errors.passwordShort",
      email: "admin.errors.emailInvalid",
      code: "admin.errors.fieldInvalid",
    });
  });

  it("falls back on the HTTP status, then on a generic sentence", () => {
    expect(describeError(new ApiError(401, "unauthorized", "x")).key).toBe("admin.errors.session");
    expect(describeError(new ApiError(403, "nope", "x")).key).toBe("admin.errors.forbidden");
    expect(describeError(new ApiError(404, "nope", "x")).key).toBe("admin.errors.not_found");
    expect(describeError(new ApiError(413, "nope", "x")).key).toBe("admin.errors.file_size");
    expect(describeError(new ApiError(500, "boom", "x")).key).toBe("admin.errors.server");
    expect(describeError(new ApiError(418, "teapot", "x"))).toMatchObject({ key: "admin.errors.generic", code: "teapot" });
    expect(describeError(new Error("?")).key).toBe("admin.errors.generic");
  });

  it("recognises a dead network", () => {
    expect(describeError(new NetworkError()).key).toBe("admin.errors.network");
  });

  it("ignores malformed details", () => {
    expect(fieldErrorsFrom(undefined)).toEqual({});
    expect(fieldErrorsFrom("x")).toEqual({});
    expect(fieldErrorsFrom([null, 3, { path: 4 }, {}])).toEqual({});
  });

  it("every key it can return exists in every language", () => {
    const codes = ["email_taken", "last_admin", "validation_failed", "forbidden", "not_found", "official_required", "federation_required", "unknown_official", "unknown_federation", "official_taken", "official_has_account", "invalid_link", "code_taken", "federation_code_taken", "country_taken", "federation_exists", "country_exists", "country_inactive", "team_exists", "stadium_exists", "unknown_country", "unsupported_media_type", "payload_too_large", "too_many_attempts"];
    const keys = new Set([
      ...codes.map((c) => describeError(new ApiError(400, c, "x")).key),
      ...[401, 403, 404, 413, 415, 429, 500, 418].map((s) => describeError(new ApiError(s, "zz", "x")).key),
      describeError(new NetworkError()).key,
    ]);
    for (const locale of locales) for (const key of keys) expect(translate(locale, key), `${locale} ${key}`).not.toBe(key);
  });
});
