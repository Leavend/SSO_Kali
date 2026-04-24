import { describe, expect, it } from "vitest";
import {
  ACCESS_DENIED_ROUTE,
  GENERIC_ERROR_ROUTE,
  HANDSHAKE_FAILED_ROUTE,
  INVALID_CREDENTIALS_ROUTE,
  legacyAuthErrorRoute,
  MFA_REQUIRED_ROUTE,
  REAUTH_REQUIRED_ROUTE,
  SESSION_EXPIRED_ROUTE,
  TOO_MANY_ATTEMPTS_ROUTE,
} from "@/lib/auth-status-routes";

describe("auth status routes", () => {
  it("maps legacy landing-page errors to dedicated routes", () => {
    expect(legacyAuthErrorRoute("auth_failed")).toBe(INVALID_CREDENTIALS_ROUTE);
    expect(legacyAuthErrorRoute("invalid_state")).toBe(HANDSHAKE_FAILED_ROUTE);
    expect(legacyAuthErrorRoute("mfa_required")).toBe(MFA_REQUIRED_ROUTE);
    expect(legacyAuthErrorRoute("not_admin")).toBe(ACCESS_DENIED_ROUTE);
    expect(legacyAuthErrorRoute("reauth_required")).toBe(REAUTH_REQUIRED_ROUTE);
    expect(legacyAuthErrorRoute("too_many_attempts")).toBe(TOO_MANY_ATTEMPTS_ROUTE);
    expect(legacyAuthErrorRoute("session_expired")).toBe(SESSION_EXPIRED_ROUTE);
  });

  it("returns null for undefined/no error", () => {
    expect(legacyAuthErrorRoute(undefined)).toBeNull();
  });

  it("routes unknown error codes to generic error page", () => {
    expect(legacyAuthErrorRoute("unknown")).toBe(GENERIC_ERROR_ROUTE);
    expect(legacyAuthErrorRoute("random_error_123")).toBe(GENERIC_ERROR_ROUTE);
  });
});
