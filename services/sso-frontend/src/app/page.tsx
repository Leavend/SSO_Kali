import { redirect } from "next/navigation";
import SignInForm from "@/components/SignInForm";
import { resolveAdminAuthState } from "@/lib/admin-auth-state";
import {
  ACCESS_DENIED_ROUTE,
  legacyAuthErrorRoute,
  REAUTH_REQUIRED_ROUTE,
} from "@/lib/auth-status-routes";
import { recordAdminAuthFunnelEvent } from "@/lib/admin-auth-funnel";

type Props = { searchParams: Promise<{ error?: string }> };

export default async function HomePage({ searchParams }: Props) {
  const params = await searchParams;
  const legacyRoute = legacyAuthErrorRoute(params.error);

  if (legacyRoute) {
    redirect(legacyRoute);
  }

  const authState = await resolveAdminAuthState().catch(() => null);

  if (authState?.status === "authorized") {
    redirect("/dashboard");
  }

  if (authState?.status === "forbidden") {
    redirect(ACCESS_DENIED_ROUTE);
  }

  if (authState?.status === "stale_session") {
    redirect(REAUTH_REQUIRED_ROUTE);
  }

  recordAdminAuthFunnelEvent("admin_login_page_view");

  return <SignInForm />;
}
