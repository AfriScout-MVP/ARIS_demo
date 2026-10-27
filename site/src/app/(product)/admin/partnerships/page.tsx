"use client";

import { RequireRole } from "@/components/auth/RequireRole";
import { PartnershipsView } from "@/components/partnerships/PartnershipsView";

export default function PartnershipsPage() {
  return (
    <RequireRole roles={["admin"]}>
      <PartnershipsView />
    </RequireRole>
  );
}
