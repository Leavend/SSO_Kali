import { redisIncrement } from "@/lib/redis";

export const ADMIN_AUTH_FUNNEL_EVENTS = [
  "admin_login_page_view",
  "admin_login_started",
  "admin_login_success",
  "admin_invalid_credentials",
  "admin_forbidden",
  "admin_reauth_required",
] as const;

export type AdminAuthFunnelEvent = typeof ADMIN_AUTH_FUNNEL_EVENTS[number];

export function adminAuthFunnelMetricKey(event: AdminAuthFunnelEvent): string {
  return `sso-frontend:metrics:admin_auth_funnel_total:${event}`;
}

export function recordAdminAuthFunnelEvent(
  event: AdminAuthFunnelEvent,
): void {
  void Promise
    .resolve(redisIncrement(adminAuthFunnelMetricKey(event)))
    .catch(() => undefined);
}
