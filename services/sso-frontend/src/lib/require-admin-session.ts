import { redirect } from "next/navigation";
import { resolveAdminAuthState } from "@/lib/admin-auth-state";
import { ACCESS_DENIED_ROUTE, MFA_REQUIRED_ROUTE, REAUTH_REQUIRED_ROUTE } from "@/lib/auth-status-routes";
import { recordForbiddenAttempt } from "@/lib/rbac-telemetry";
import type { AdminSession } from "@/lib/session";

export async function requireAdminSession(pathname: string): Promise<AdminSession> {
  const state = await resolveAdminAuthState();

  if (state.status === "authorized") {
    return state.session;
  }

  if (state.status === "forbidden") {
    recordDenied(pathname, state.session);
    redirect(ACCESS_DENIED_ROUTE);
  }

  if (state.status === "mfa_required") {
    redirect(MFA_REQUIRED_ROUTE);
  }

  if (state.status === "stale_session") {
    redirect(REAUTH_REQUIRED_ROUTE);
  }

  // Redirect through a client-side page to avoid CORS when
  // Next.js RSC navigation follows redirects to external IdP URLs.
  // /auth/redirect is a "use client" page that does window.location.replace("/auth/login").
  redirect("/auth/redirect");
}

function recordDenied(pathname: string, session: AdminSession): void {
  recordForbiddenAttempt({
    pathname,
    reason: "session_role_denied",
    role: session.role,
    subjectId: session.sub,
  });
}
