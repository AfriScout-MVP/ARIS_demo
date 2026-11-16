import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LoginForm } from "@/components/auth/LoginScreen";
import { ForgotPasswordForm, ResetPasswordScreen } from "@/components/auth/RecoveryForms";
import { DatasetProvider } from "@/lib/dataset/DatasetProvider";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import { dictionaries } from "@/locales";

const inApp = (el: React.ReactElement) =>
  renderToString(createElement(ThemeProvider, null, createElement(LocaleProvider, null, createElement(DatasetProvider, null, el))));
const fr = dictionaries.fr.account;
const esc = (s: string) => s.replace(/'/g, "&#x27;");

describe("password recovery screens", () => {
  it("has the /reset-password route the e-mailed link points at", () => {
    // api/src/domain/recovery-mail.ts builds `<origin>/reset-password?token=…`; without this page the link is a 404
    expect(existsSync(fileURLToPath(new URL("../../src/app/reset-password/page.tsx", import.meta.url)))).toBe(true);
  });

  it("offers 'forgot password' on the sign-in form", () => {
    expect(inApp(createElement(LoginForm))).toContain(esc(fr.forgot.link));
  });

  it("renders the request form with an e-mail field, a submit button and a way back", () => {
    const html = inApp(createElement(ForgotPasswordForm, { onBack: () => undefined }));
    for (const text of [fr.forgot.title, fr.forgot.subtitle, fr.forgot.submit, fr.forgot.back]) expect(html).toContain(esc(text));
    expect(html).toContain('type="email"');
    expect(html).not.toMatch(/account\.[a-z]+\.[a-zA-Z]+/); // no raw translation key
  });

  it("holds the reset card back until the address has been read (static export: no query string on the server)", () => {
    const html = inApp(createElement(ResetPasswordScreen));
    expect(html).not.toContain("type=\"password\"");
    expect(html).not.toMatch(/account\.[a-z]+\.[a-zA-Z]+/);
  });
});
