"use client";

import { FederationsView } from "@/components/admin/FederationsView";
import { RequireRole } from "@/components/auth/RequireRole";

export default function FederationsPage() {
  return (
    <RequireRole roles={["admin"]}>
      <FederationsView />
    </RequireRole>
  );
}
