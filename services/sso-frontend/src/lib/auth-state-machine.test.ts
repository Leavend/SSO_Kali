import { describe, expect, it } from "vitest";
import {
  initialAdminAuthState,
  transitionAdminAuthState,
  type AdminAuthState,
} from "@/lib/auth-state-machine";
import type { AdminSession } from "@/lib/session";

describe("auth-state-machine", () => {
  it("moves from anonymous to needs_credentials on entry", () => {
    const state = transitionAdminAuthState(initialAdminAuthState(), {
      type: "ENTRY_VISITED",
    });

    expect(state.status).toBe("needs_credentials");
  });

  it("moves from needs_credentials to authenticating when a session is discovered", () => {
    const state = transitionAdminAuthState(
      { status: "needs_credentials" },
      { type: "SESSION_DISCOVERED", session: adminSession() },
    );

    expect(state.status).toBe("authenticating");
  });

  it("moves from authenticating to authorized after /me bootstrap succeeds", () => {
    const state = transitionAdminAuthState(authenticating(), {
      type: "BOOTSTRAP_SUCCEEDED",
      session: adminSession(),
    });

    expect(state.status).toBe("authorized");
  });

  it("moves from authorized to stale_session when freshness becomes invalid", () => {
    const state = transitionAdminAuthState(
      { status: "authorized", session: adminSession() },
      { type: "BOOTSTRAP_STALE", session: adminSession() },
    );

    expect(state.status).toBe("stale_session");
  });

  it("moves from authenticating to forbidden when bootstrap denies access", () => {
    const state = transitionAdminAuthState(authenticating(), {
      type: "BOOTSTRAP_FORBIDDEN",
      session: adminSession(),
    });

    expect(state.status).toBe("forbidden");
  });
});

function authenticating(): AdminAuthState {
  return {
    status: "authenticating",
    session: adminSession(),
  };
}

function adminSession(): AdminSession {
  return {
    accessToken: "access-token",
    idToken: "id-token",
    refreshToken: "refresh-token",
    sub: "123456789",
    email: "admin@example.com",
    displayName: "Admin User",
    role: "admin",
    expiresAt: 1_900_000_000,
    authTime: 1_800_000_000,
    amr: ["pwd"],
    acr: "urn:example:loa:2",
    lastLoginAt: "2026-04-05T12:00:00Z",
    permissions: {
      view_admin_panel: true,
      manage_sessions: true,
    },
  };
}
