import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { MobileNav } from "@/components/layout/MobileNav";

export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-aris-bg bg-grid">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <Topbar />
        <main className="flex-1 px-4 sm:px-6 py-6 pb-24 lg:pb-6 max-w-[1600px] w-full mx-auto">
          {children}
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
