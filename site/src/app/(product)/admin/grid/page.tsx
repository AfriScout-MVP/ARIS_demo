"use client";

import { GridView } from "@/components/admin/GridView";
import { RequireRole } from "@/components/auth/RequireRole";

export default function GridPage() {
  return (
    <RequireRole roles={["admin"]}>
      <GridView />
    </RequireRole>
  );
}
