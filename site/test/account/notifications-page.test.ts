import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NotificationsPage } from "@/components/notifications/NotificationsPage";
import { notificationsHref } from "@/lib/account/rules";
import { DatasetProvider } from "@/lib/dataset/DatasetProvider";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import { ToastProvider } from "@/lib/toast/ToastProvider";
import { dictionaries } from "@/locales";

const here = (p: string) => fileURLToPath(new URL(`../../src/app/${p}`, import.meta.url));

describe("notifications page", () => {
  it("exists at every address 'See all' can lead to", () => {
    for (const role of ["admin", "federation", "tagger", "referee"]) {
      const href = notificationsHref(role);
      const file = href === "/me/notifications" ? "me/notifications/page.tsx" : "(product)/notifications/page.tsx";
      expect(existsSync(here(file)), `${role} -> ${href}`).toBe(true);
    }
  });

  it("renders its heading and a loading frame without raw translation keys", () => {
    const html = renderToString(
      createElement(ThemeProvider, null, createElement(LocaleProvider, null, createElement(ToastProvider, null, createElement(DatasetProvider, null, createElement(NotificationsPage))))),
    );
    expect(html).toContain(dictionaries.fr.account.notifications.title);
    expect(html).not.toMatch(/account\.notifications\.[a-zA-Z]+/);
  });
});
