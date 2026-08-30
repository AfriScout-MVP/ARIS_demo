"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** The overview lives at the root now. Old links land here and move on. */
export default function DashboardRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return null;
}
