import { redirect } from "next/navigation";
import AccessDeniedState from "@/components/AccessDeniedState";
import { resolveAdminAuthState } from "@/lib/admin-auth-state";
import { recordAdminAuthFunnelEvent } from "@/lib/admin-auth-funnel";

export default async function AccessDeniedPage() {
  const authState = await resolveAdminAuthState().catch(() => null);

  if (authState?.status === "authorized") {
    redirect("/dashboard");
  }

  recordAdminAuthFunnelEvent("admin_forbidden");

  return <AccessDeniedState />;
}
