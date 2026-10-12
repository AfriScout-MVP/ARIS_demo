import { DataGate } from "@/components/auth/DataGate";
import { PersonalShell } from "@/components/auth/PersonalShell";

export default function PersonalLayout({ children }: { children: React.ReactNode }) {
  return (
    <DataGate area="personal">
      <PersonalShell>{children}</PersonalShell>
    </DataGate>
  );
}
