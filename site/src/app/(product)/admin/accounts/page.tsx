"use client";

import { AccountsView } from "@/components/admin/AccountsView";
import { RequireRole } from "@/components/auth/RequireRole";

export default function AccountsPage() {
  return (
    <RequireRole roles={["admin", "federation"]}>
      <AccountsView />
    </RequireRole>
  );
}
