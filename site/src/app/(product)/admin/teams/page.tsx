"use client";

import { TeamsView } from "@/components/admin/TeamsView";
import { RequireRole } from "@/components/auth/RequireRole";

export default function TeamsPage() {
  return (
    <RequireRole roles={["admin", "federation"]}>
      <TeamsView />
    </RequireRole>
  );
}
