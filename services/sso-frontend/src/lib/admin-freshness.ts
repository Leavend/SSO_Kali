const ADMIN_PANEL_WINDOW_SECONDS = 55 * 60;
const SENSITIVE_ACTION_WINDOW_SECONDS = 5 * 60;

export function isAdminSessionFresh(
  authTime: number | null,
  nowMs: number = Date.now(),
): boolean {
  return authAgeSeconds(authTime, nowMs) <= ADMIN_PANEL_WINDOW_SECONDS;
}

export function requiresAdminSessionReauth(
  authTime: number | null,
  nowMs: number = Date.now(),
): boolean {
  return !isAdminSessionFresh(authTime, nowMs);
}

export function isSensitiveActionFresh(
  authTime: number | null,
  nowMs: number = Date.now(),
): boolean {
  return authAgeSeconds(authTime, nowMs) <= SENSITIVE_ACTION_WINDOW_SECONDS;
}

export function requiresSensitiveActionStepUp(
  authTime: number | null,
  nowMs: number = Date.now(),
): boolean {
  return !isSensitiveActionFresh(authTime, nowMs);
}

function authAgeSeconds(authTime: number | null, nowMs: number): number {
  if (authTime === null) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, nowSeconds(nowMs) - authTime);
}

function nowSeconds(nowMs: number): number {
  return Math.floor(nowMs / 1000);
}
