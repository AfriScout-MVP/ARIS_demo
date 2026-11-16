import type { Metadata } from "next";
import { ResetPasswordScreen } from "@/components/auth/RecoveryForms";

// The e-mailed link lands here. The page is public: it must not sit behind the product shell's sign-in gate.
export const metadata: Metadata = {
  title: "Nouveau mot de passe | ARIS",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return <ResetPasswordScreen />;
}
