"use client";

import { Suspense } from "react";
import { RequireRole } from "@/components/auth/RequireRole";
import { FinanceView } from "@/components/finance/FinanceView";

export default function FinancePage() {
  return (
    <RequireRole roles={["admin", "federation"]}>
      <Suspense fallback={null}>
        <FinanceView />
      </Suspense>
    </RequireRole>
  );
}
