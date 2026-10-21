"use client";

import { CountriesView } from "@/components/admin/CountriesView";
import { RequireRole } from "@/components/auth/RequireRole";

export default function CountriesPage() {
  return (
    <RequireRole roles={["admin"]}>
      <CountriesView />
    </RequireRole>
  );
}
