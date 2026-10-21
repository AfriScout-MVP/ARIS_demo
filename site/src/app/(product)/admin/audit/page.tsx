"use client";

import { AuditView } from "@/components/admin/AuditView";
import { RequireRole } from "@/components/auth/RequireRole";

export default function AuditPage() {
  return (
    <RequireRole roles={["admin", "federation"]}>
      <AuditView />
    </RequireRole>
  );
}
