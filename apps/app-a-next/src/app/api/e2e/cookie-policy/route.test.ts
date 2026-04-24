import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerConfig = vi.fn();

vi.mock("@/lib/app-config", () => ({
  getServerConfig,
}));

describe("app a e2e cookie policy probe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENABLE_E2E_COOKIE_PROBE = "1";
    getServerConfig.mockReturnValue({
      sessionCookieName: "__Host-app-a-session",
    });
  });

  it("sets a secure host-only cookie", async () => {
    const { GET } = await import("@/app/api/e2e/cookie-policy/route");
    const response = await GET();
    const header = response.headers.get("set-cookie") ?? "";

    expect(header).toContain("__Host-app-a-session=probe-session");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("Path=/");
    expect(header).toContain("SameSite=lax");
    expect(header).not.toContain("Domain=");
  });

  it("expires the secure host-only cookie", async () => {
    const { DELETE } = await import("@/app/api/e2e/cookie-policy/route");
    const response = await DELETE();
    const header = response.headers.get("set-cookie") ?? "";

    expect(header).toContain("__Host-app-a-session=");
    expect(header).toContain("Max-Age=0");
    expect(header).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("Path=/");
    expect(header).not.toContain("Domain=");
  });
});
