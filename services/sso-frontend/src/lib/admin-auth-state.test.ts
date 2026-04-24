import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminApiError } from "@/lib/admin-api-error";

const fetchPrincipal = vi.fn();
const getSession = vi.fn();

vi.mock("@/lib/admin-api", () => ({
  fetchPrincipal,
}));

vi.mock("@/lib/session", () => ({
  getSession,
  sessionFromBootstrap: vi.fn(),
}));

describe("admin-auth-state", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getSession.mockResolvedValue(baseSession());
  });

  it("returns needs_credentials when there is no session", async () => {
    getSession.mockResolvedValueOnce(null);

    const { resolveAdminAuthState } = await import("@/lib/admin-auth-state");
    const state = await resolveAdminAuthState();

    expect(state.status).toBe("needs_credentials");
  });

  it("returns authorized from a bootstrapped local session without refetching /me", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_775_523_100_000));

    const { resolveAdminAuthState } = await import("@/lib/admin-auth-state");
    const state = await resolveAdminAuthState();

    expect(state.status).toBe("authorized");
    expect(fetchPrincipal).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("falls back to /me bootstrap for legacy sessions that are missing principal fields", async () => {
    getSession.mockResolvedValueOnce(legacySession());
    fetchPrincipal.mockResolvedValueOnce(principal());

    const { resolveAdminAuthState } = await import("@/lib/admin-auth-state");
    const state = await resolveAdminAuthState();

    expect(state.status).toBe("authorized");
    expect(fetchPrincipal).toHaveBeenCalledWith(legacySession());
  });

  it("returns forbidden from a bootstrapped local session when panel access is denied", async () => {
    getSession.mockResolvedValueOnce({
      ...baseSession(),
      permissions: {
        view_admin_panel: false,
        manage_sessions: false,
      },
      role: "viewer",
    });

    const { resolveAdminAuthState } = await import("@/lib/admin-auth-state");
    const state = await resolveAdminAuthState();

    expect(state.status).toBe("forbidden");
    expect(fetchPrincipal).not.toHaveBeenCalled();
  });

  it("returns stale_session from a bootstrapped local session when auth freshness expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_775_526_301_000));

    const { resolveAdminAuthState } = await import("@/lib/admin-auth-state");
    const state = await resolveAdminAuthState();

    expect(state.status).toBe("stale_session");
    expect(fetchPrincipal).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("returns stale_session when /me requires reauthentication for legacy sessions", async () => {
    getSession.mockResolvedValueOnce(legacySession());
    fetchPrincipal.mockRejectedValueOnce(new AdminApiError(401, "reauth", "reauth_required"));

    const { resolveAdminAuthState } = await import("@/lib/admin-auth-state");
    const state = await resolveAdminAuthState();

    expect(state.status).toBe("stale_session");
  });
});

function baseSession() {
  return {
    accessToken: "access-token",
    idToken: "id-token",
    refreshToken: "refresh-token",
    sub: "123456789",
    email: "admin@example.com",
    displayName: "Admin User",
    role: "admin",
    expiresAt: 1_900_000_000,
    authTime: 1_775_523_000,
    amr: ["pwd"],
    acr: "urn:example:loa:2",
    lastLoginAt: "2026-04-05T12:00:00Z",
    permissions: {
      view_admin_panel: true,
      manage_sessions: true,
    },
  };
}

function legacySession() {
  return {
    accessToken: "access-token",
    idToken: "id-token",
    refreshToken: "refresh-token",
    sub: "123456789",
    email: "admin@example.com",
    displayName: "Admin User",
    role: "admin",
    expiresAt: 1_900_000_000,
  };
}

function principal() {
  return {
    subject_id: "123456789",
    email: "admin@example.com",
    display_name: "Admin User",
    role: "admin",
    last_login_at: "2026-04-05T12:00:00Z",
    auth_context: {
      auth_time: 1_800_000_000,
      amr: ["pwd"],
      acr: "urn:example:loa:2",
    },
    permissions: {
      view_admin_panel: true,
      manage_sessions: true,
    },
  };
}
