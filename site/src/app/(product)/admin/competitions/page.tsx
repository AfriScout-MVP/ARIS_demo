"use client";

import { CompetitionsView } from "@/components/admin/CompetitionsView";
import { RequireRole } from "@/components/auth/RequireRole";

export default function CompetitionsPage() {
  return (
    <RequireRole roles={["admin", "federation"]}>
      <CompetitionsView />
    </RequireRole>
  );
}
