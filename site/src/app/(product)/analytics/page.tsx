"use client";

import { Suspense } from "react";
import { AnalyticsView } from "@/components/analytics/AnalyticsView";
import { RequireRole } from "@/components/auth/RequireRole";

export default function AnalyticsPage() {
  return (
    <RequireRole roles={["admin", "federation"]}>
      <Suspense fallback={null}>
        <AnalyticsView />
      </Suspense>
    </RequireRole>
  );
}
