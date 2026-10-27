"use client";

import { Fragment, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LoadingScreen } from "@/components/icons/MarkLoader";
import { Landing } from "@/components/landing/Landing";
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/LocaleProvider";
import { useDataset } from "@/lib/dataset/DatasetProvider";
import { isReferee, isStaff, isTagger } from "@/lib/roles";
import { ChangePasswordDialog } from "./ChangePasswordDialog";
import { LoginScreen } from "./LoginScreen";

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center text-chalk-dim">
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
  const forcedPasswordChange = status === "ready" && !!user?.mustChangePassword;

  const sendToPersonal = status === "ready" && !forcedPasswordChange && area === "staff" && isReferee(user);
  const sendToStaff = status === "ready" && !forcedPasswordChange && area === "personal" && isStaff(user);
  // a tagger reaches only the tagging screen: everywhere else in the product (staff area and /me alike) bounces back to it
  const sendToTagging = status === "ready" && !forcedPasswordChange && isTagger(user) && pathname !== "/decision-engine";

  useEffect(() => {
    if (sendToPersonal && pathname !== "/me") router.replace("/me");
    if (sendToStaff) router.replace("/");
    if (sendToTagging) router.replace("/decision-engine");
  }, [sendToPersonal, sendToStaff, sendToTagging, pathname, router]);

  if (status === "loading") return <LoadingScreen label={t("auth.loading")} />;
  // the public landing page at the root; a deep link keeps the plain sign-in screen
  if (status === "signed-out") return area === "staff" && pathname === "/" ? <Landing /> : <LoginScreen />;
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
  // a password set by someone else (a new account, or one just reset) blocks every route on the Worker but
  // /auth: nothing else can render correctly until it is changed, so this stands in for the whole product.
  if (forcedPasswordChange) {
    return (
      <Centered>
        {/* required: only the dialog's own success path calls onClose, right before it signs the person out */}
        <ChangePasswordDialog required onClose={() => {}} />
      </Centered>
    );
  }
  if (sendToPersonal || sendToStaff) return null;

  // a fresh key remounts the screens whenever the data is replaced, so nothing renders half-old numbers
  return <Fragment key={version}>{children}</Fragment>;
}
