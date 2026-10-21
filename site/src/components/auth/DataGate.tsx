"use client";

import { Fragment, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Mark } from "@/components/icons/Mark";
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/LocaleProvider";
import { useDataset } from "@/lib/dataset/DatasetProvider";
import { isReferee, isStaff } from "@/lib/roles";
import { LoginScreen } from "./LoginScreen";

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ink-0 p-6 text-center text-chalk-dim">
      {children}
    </main>
  );
}

/**
 * Holds the app back until the API has said who is signed in and the data is in memory.
 *
 * `area="staff"` is the product shell (admin and federation seats); `area="personal"` is the
 * referee's own space (`/me`). Each role is sent to its own area.
 */
export function DataGate({ area, children }: { area: "staff" | "personal"; children: React.ReactNode }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const { status, user, version, reload } = useDataset();

  const sendToPersonal = status === "ready" && area === "staff" && isReferee(user);
  const sendToStaff = status === "ready" && area === "personal" && isStaff(user);

  useEffect(() => {
    if (sendToPersonal && pathname !== "/me") router.replace("/me");
    if (sendToStaff) router.replace("/");
  }, [sendToPersonal, sendToStaff, pathname, router]);

  if (status === "loading") {
    return (
      <Centered>
        <Mark size={36} className="animate-pulse text-chalk" />
        <p className="text-sm" role="status">
          {t("auth.loading")}
        </p>
      </Centered>
    );
  }
  if (status === "signed-out") return <LoginScreen />;
  if (status === "error") {
    return (
      <Centered>
        <p role="alert" className="text-sm text-chalk">
          {t("auth.loadFailed")}
        </p>
        <Button variant="primary" onClick={() => void reload()}>
          {t("auth.retry")}
        </Button>
      </Centered>
    );
  }
  if (sendToPersonal || sendToStaff) return null;

  // a fresh key remounts the screens whenever the data is replaced, so nothing renders half-old numbers
  return <Fragment key={version}>{children}</Fragment>;
}
