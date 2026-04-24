export const ACCESS_DENIED_ROUTE = "/access-denied";
export const HANDSHAKE_FAILED_ROUTE = "/handshake-failed";
export const INVALID_CREDENTIALS_ROUTE = "/invalid-credentials";
export const MFA_REQUIRED_ROUTE = "/mfa-required";
export const REAUTH_REQUIRED_ROUTE = "/reauth-required";
export const TOO_MANY_ATTEMPTS_ROUTE = "/too-many-attempts";
export const SESSION_EXPIRED_ROUTE = "/session-expired";
export const GENERIC_ERROR_ROUTE = "/error";

export function legacyAuthErrorRoute(error: string | undefined): string | null {
  if (!error) {
    return null;
  }

  switch (error) {
    case "auth_failed":
      return INVALID_CREDENTIALS_ROUTE;
    case "invalid_state":
    case "handshake_failed":
      return HANDSHAKE_FAILED_ROUTE;
    case "mfa_required":
      return MFA_REQUIRED_ROUTE;
    case "not_admin":
      return ACCESS_DENIED_ROUTE;
    case "reauth_required":
      return REAUTH_REQUIRED_ROUTE;
    case "too_many_attempts":
      return TOO_MANY_ATTEMPTS_ROUTE;
    case "session_expired":
      return SESSION_EXPIRED_ROUTE;
    default:
      // Unknown error codes redirect to generic error page
      return GENERIC_ERROR_ROUTE;
  }
}
