"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Segmented } from "@/components/ui";
import { PageHeading } from "@/components/layout/PageHeading";
import { PAYMENT_STATUSES } from "@/lib/api/finance";
import type { PaymentView } from "@/lib/finance/rules";
import { useT } from "@/lib/i18n/LocaleProvider";
import { AdvancesTab } from "./AdvancesTab";
import { PaymentsTab } from "./PaymentsTab";
import { ScalesTab } from "./ScalesTab";

const TABS = ["payments", "advances", "scales"] as const;
type Tab = (typeof TABS)[number];

/** Fees, advances and fee scales. `?tab=` and `?status=` let a notification open the right list. */
export function FinanceView() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const asked = params.get("tab");
  const status = params.get("status");
  const [tab, setTab] = useState<Tab>((TABS as readonly string[]).includes(asked ?? "") ? (asked as Tab) : "payments");
  const initialView = (PAYMENT_STATUSES as readonly string[]).includes(status ?? "") ? (status as PaymentView) : undefined;

  const pick = (next: Tab) => {
    setTab(next);
    router.replace(next === "payments" ? "/finance" : `/finance?tab=${next}`, { scroll: false });
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeading titleKey="finance.title" subtitleKey="finance.subtitle" />
      <Segmented value={tab} onChange={pick} options={TABS.map((x) => ({ value: x, label: t(`finance.tabs.${x}`) }))} />
      <div role="tabpanel" aria-label={t(`finance.tabs.${tab}`)}>
        {tab === "payments" && <PaymentsTab initialView={initialView} onOpenScales={() => pick("scales")} />}
        {tab === "advances" && <AdvancesTab />}
        {tab === "scales" && <ScalesTab />}
      </div>
    </div>
  );
}
