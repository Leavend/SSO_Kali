import { redirect } from "next/navigation";
import { isAdminApiError, isMfaRequiredApiError, isReauthRequiredApiError } from "@/lib/admin-api-error";
import { ACCESS_DENIED_ROUTE, MFA_REQUIRED_ROUTE, REAUTH_REQUIRED_ROUTE } from "@/lib/auth-status-routes";
import { recordForbiddenAttempt } from "@/lib/rbac-telemetry";
import type { AdminSession } from "@/lib/session";

type AccessDeniedContext = {
  readonly pathname: string;
  readonly reason: string;
  readonly session: AdminSession;
};

export function redirectOnAccessDenied(error: unknown, context: AccessDeniedContext): void {
  if (!isAdminApiError(error)) return;

  if (isReauthRequiredApiError(error)) {
    redirect(REAUTH_REQUIRED_ROUTE);
  }

  // MFA-specific 403 must be checked before the generic 403 catch-all.
  if (isMfaRequiredApiError(error)) {
    redirect(MFA_REQUIRED_ROUTE);
  }

  if (error.status !== 403 && error.code !== "forbidden") return;

  recordDenied(context, error.status);
  redirect(ACCESS_DENIED_ROUTE);
}

function recordDenied(context: AccessDeniedContext, status: number): void {
  recordForbiddenAttempt({
    pathname: context.pathname,
    reason: context.reason,
    role: context.session.role,
    status,
    subjectId: context.session.sub,
  });
}
