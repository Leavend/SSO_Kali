import { redirect } from "next/navigation";
import { resolveAdminAuthState } from "@/lib/admin-auth-state";
import { ACCESS_DENIED_ROUTE } from "@/lib/auth-status-routes";

export default async function NotAdminPage() {
  const authState = await resolveAdminAuthState().catch(() => null);

  if (authState?.status === "authorized") {
    redirect("/dashboard");
  }

  redirect(ACCESS_DENIED_ROUTE);
}
