import { describe, expect, it } from "vitest";
import {
  accessDeniedCopy,
  authStatusMatrix,
  handshakeFailedCopy,
  invalidCredentialsCopy,
  mfaRequiredCopy,
  reauthRequiredCopy,
  tooManyAttemptsCopy,
} from "@/lib/auth-status-copy";

describe("auth-status-copy", () => {
  it("keeps the public auth failure copy professional and non-leaky", () => {
    const copy = [
      accessDeniedCopy,
      handshakeFailedCopy,
      invalidCredentialsCopy,
      mfaRequiredCopy,
      reauthRequiredCopy,
      tooManyAttemptsCopy,
    ];

    for (const item of copy) {
      expect(serialized(item)).not.toMatch(/digest|exception|stack|trace|server component|api logs/i);
    }
  });

  it("uses clear recovery actions for each auth failure state", () => {
    expect(accessDeniedCopy.primaryAction.label).toBe("Back to Secure Sign-In");
    expect(handshakeFailedCopy.secondaryAction?.label).toBe("Clear Session and Retry");
    expect(invalidCredentialsCopy.secondaryAction?.label).toBe("Retry Hosted Login");
    expect(mfaRequiredCopy.primaryAction.label).toBe("Set Up 2FA Now");
    expect(reauthRequiredCopy.primaryAction.label).toBe("Verify Again");
    expect(tooManyAttemptsCopy.primaryAction.label).toBe("Back to Secure Sign-In");
  });

  it("keeps the route and taxonomy matrix aligned", () => {
    expect(authStatusMatrix.accessDenied.route).toBe("/access-denied");
    expect(authStatusMatrix.accessDenied.taxonomy).toBe("forbidden");
    expect(authStatusMatrix.reauthRequired.route).toBe("/reauth-required");
    expect(authStatusMatrix.reauthRequired.taxonomy).toBe("reauth_required");
    expect(authStatusMatrix.invalidCredentials.route).toBe("/invalid-credentials");
    expect(authStatusMatrix.invalidCredentials.taxonomy).toBe("invalid_credentials");
    expect(authStatusMatrix.mfaRequired.route).toBe("/mfa-required");
    expect(authStatusMatrix.mfaRequired.taxonomy).toBe("mfa_required");
    expect(authStatusMatrix.handshakeFailed.route).toBe("/handshake-failed");
    expect(authStatusMatrix.handshakeFailed.taxonomy).toBe("handshake_failed");
    expect(authStatusMatrix.tooManyAttempts.route).toBe("/too-many-attempts");
    expect(authStatusMatrix.tooManyAttempts.taxonomy).toBe("too_many_attempts");
  });
});

function serialized(value: unknown): string {
  return JSON.stringify(value);
}
