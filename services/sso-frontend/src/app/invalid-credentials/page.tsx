import { recordAdminAuthFunnelEvent } from "@/lib/admin-auth-funnel";
import { invalidCredentialsCopy } from "@/lib/auth-status-copy";
import AuthStatusPage from "@/components/AuthStatusPage";

export default async function InvalidCredentialsPage() {
  recordAdminAuthFunnelEvent("admin_invalid_credentials");

  return <AuthStatusPage {...invalidCredentialsCopy} />;
}
