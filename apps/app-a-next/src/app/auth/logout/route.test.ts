import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const destroySession = vi.fn();
const findSession = vi.fn();
const getServerConfig = vi.fn();
const logoutSession = vi.fn();

vi.mock("@/lib/app-config", () => ({
  getServerConfig,
}));

vi.mock("@/lib/oidc", () => ({
  logoutSession,
}));

vi.mock("@/lib/session-store", () => ({
  destroySession,
  findSession,
}));

describe("POST /auth/logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerConfig.mockReturnValue({
      sessionCookieName: "__Host-app-a-session",
    });
  });

  it("expires the host-only cookie with secure attributes", async () => {
    findSession.mockResolvedValue({
      accessToken: "access-token",
    });
    destroySession.mockResolvedValue(undefined);
    logoutSession.mockResolvedValue(undefined);

    const { POST } = await import("@/app/auth/logout/route");
    const request = new NextRequest("https://app-a.example/auth/logout", {
      method: "POST",
      headers: {
        cookie: "__Host-app-a-session=session-123",
      },
    });

    const response = await POST(request);
    const header = response.headers.get("set-cookie") ?? "";

    expect(header).toContain("__Host-app-a-session=");
    expect(header).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("Path=/");
    expect(header).toContain("SameSite=lax");
    expect(header).not.toContain("Domain=");
  });
});
