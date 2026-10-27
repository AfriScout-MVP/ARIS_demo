"use client";

import { Suspense } from "react";
import { RequireRole } from "@/components/auth/RequireRole";
import { DisciplineView } from "@/components/discipline/DisciplineView";

export default function DisciplinePage() {
  return (
    <RequireRole roles={["admin", "federation"]}>
      <Suspense fallback={null}>
        <DisciplineView />
      </Suspense>
    </RequireRole>
  );
}
