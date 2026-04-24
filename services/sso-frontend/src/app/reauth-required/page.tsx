import AuthStatusPage from "@/components/AuthStatusPage";
import AutoRetryCountdown from "@/components/AutoRetryCountdown";
import { resolveAdminAuthState } from "@/lib/admin-auth-state";
import { recordAdminAuthFunnelEvent } from "@/lib/admin-auth-funnel";
import { reauthRequiredCopy } from "@/lib/auth-status-copy";
import { redirect } from "next/navigation";

export default async function ReauthRequiredPage() {
  const authState = await resolveAdminAuthState().catch(() => null);

  if (authState?.status === "authorized") {
    redirect("/dashboard");
  }

  recordAdminAuthFunnelEvent("admin_reauth_required");

  return (
    <AuthStatusPage {...reauthRequiredCopy}>
      <AutoRetryCountdown
        redirectTo="/auth/login"
        seconds={8}
        label="Auto-redirect ke login dalam"
      />
    </AuthStatusPage>
  );
}
