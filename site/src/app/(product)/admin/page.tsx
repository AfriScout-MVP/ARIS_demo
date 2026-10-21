"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/LocaleProvider";

/** `/admin` has no content of its own: it sends the visitor to the accounts list. */
export default function AdminIndexPage() {
  const router = useRouter();
  const t = useT();

  useEffect(() => {
    router.replace("/admin/accounts");
  }, [router]);

  return (
    <p role="status" className="text-sm text-chalk-dim">
      {t("admin.common.redirecting")}{" "}
      <Link href="/admin/accounts" className="font-semibold text-chalk underline">
        {t("admin.nav.accounts")}
      </Link>
    </p>
  );
}
