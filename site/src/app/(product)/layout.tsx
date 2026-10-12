import { AppShell } from "@/components/layout/AppShell";
import { DataGate } from "@/components/auth/DataGate";

export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return (
    <DataGate area="staff">
      <AppShell>{children}</AppShell>
    </DataGate>
  );
}
