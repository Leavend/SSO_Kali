import { describe, expect, it, vi, beforeEach } from "vitest";
import { AdminApiError } from "@/lib/admin-api-error";

const getSession = vi.fn();
const revokeSession = vi.fn();
const revokeUserSessions = vi.fn();
const recordForbiddenAttempt = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/lib/session", () => ({ getSession }));
vi.mock("@/lib/admin-api", () => ({ revokeSession, revokeUserSessions }));
vi.mock("@/lib/rbac-telemetry", () => ({ recordForbiddenAttempt }));
vi.mock("next/cache", () => ({ revalidatePath }));

describe("Server Actions input validation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects empty session IDs", async () => {
    getSession.mockResolvedValueOnce(adminSession());

    const { revokeSessionAction } = await import("@/app/actions");
    const result = await revokeSessionAction("");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Invalid");
  });

  it("rejects IDs with special characters (XSS prevention)", async () => {
    getSession.mockResolvedValueOnce(adminSession());

    const { revokeSessionAction } = await import("@/app/actions");
    const result = await revokeSessionAction("abc<script>alert(1)</script>");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Invalid");
  });

  it("rejects IDs exceeding max length", async () => {
    getSession.mockResolvedValueOnce(adminSession());

    const { revokeSessionAction } = await import("@/app/actions");
    const result = await revokeSessionAction("a".repeat(129));

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Invalid");
  });

  it("accepts valid alphanumeric session IDs", async () => {
    getSession.mockResolvedValueOnce(adminSession());
    revokeSession.mockResolvedValueOnce(undefined);

    const { revokeSessionAction } = await import("@/app/actions");
    const result = await revokeSessionAction("valid-session_123");

    expect(result.ok).toBe(true);
    expect(revokeSession).toHaveBeenCalled();
  });

  it("returns forbidden when user lacks manage_sessions permission", async () => {
    getSession.mockResolvedValueOnce({
      ...adminSession(),
      role: "viewer",
      permissions: { view_admin_panel: true, manage_sessions: false },
    });

    const { revokeSessionAction } = await import("@/app/actions");
    const result = await revokeSessionAction("valid-id");

    expect(result.ok).toBe(false);
    expect(result.code).toBe("forbidden");
  });

  it("returns error when no session exists", async () => {
    getSession.mockResolvedValueOnce(null);

    const { revokeSessionAction } = await import("@/app/actions");
    const result = await revokeSessionAction("valid-id");

    expect(result.ok).toBe(false);
  });

  it("maps mfa_required API failures to a dedicated action code", async () => {
    getSession.mockResolvedValueOnce(adminSession());
    revokeSession.mockRejectedValueOnce(new AdminApiError(
      403,
      "Additional verification is required.",
      "mfa_required",
    ));

    const { revokeSessionAction } = await import("@/app/actions");
    const result = await revokeSessionAction("valid-id");

    expect(result.ok).toBe(false);
    expect(result.code).toBe("mfa_required");
  });

  it("maps too_many_attempts API failures to a dedicated action code", async () => {
    getSession.mockResolvedValueOnce(adminSession());
    revokeSession.mockRejectedValueOnce(new AdminApiError(
      429,
      "Too many attempts were detected.",
      "too_many_attempts",
    ));

    const { revokeSessionAction } = await import("@/app/actions");
    const result = await revokeSessionAction("valid-id");

    expect(result.ok).toBe(false);
    expect(result.code).toBe("too_many_attempts");
  });
});

function adminSession() {
  return {
    accessToken: "token",
    idToken: "id-token",
    refreshToken: "refresh",
    sub: "admin-123",
    email: "admin@example.com",
    displayName: "Admin",
    role: "admin",
    expiresAt: 1_900_000_000,
    authTime: Math.floor(Date.now() / 1000) - 60,
    amr: ["pwd"],
    acr: "urn:example:loa:2",
    permissions: { view_admin_panel: true, manage_sessions: true },
  };
}
