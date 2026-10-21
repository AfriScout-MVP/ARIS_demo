"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, EmptyState } from "@/components/ui";
import { useT } from "@/lib/i18n/LocaleProvider";
import { RefereeProfile } from "./RefereeProfile";

// A static export cannot pre-render a page per referee (the ids only exist at run time), so the
// profile is one page that reads `?id=` — see `refereeHref` in `@/lib/store`.
function ProfileFromQuery() {
  const t = useT();
  const id = useSearchParams().get("id");
  if (!id) {
    return (
      <Card>
        <EmptyState title={t("referees.notFound")} />
      </Card>
    );
  }
  return <RefereeProfile id={id} />;
}

export default function RefereeProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfileFromQuery />
    </Suspense>
  );
}
