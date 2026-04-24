import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});

const resolveAdminAuthState = vi.fn();
const recordAdminAuthFunnelEvent = vi.fn();

vi.mock("next/navigation", () => ({
  redirect,
}));

vi.mock("@/lib/admin-auth-state", () => ({
  resolveAdminAuthState,
}));

vi.mock("@/lib/admin-auth-funnel", () => ({
  recordAdminAuthFunnelEvent,
}));

describe("home page auth entry", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("redirects to the dashboard only when the state machine resolves authorized", async () => {
    resolveAdminAuthState.mockResolvedValueOnce({
      status: "authorized",
      session: {},
    });

    const { default: HomePage } = await import("@/app/page");

    await expect(
      HomePage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("renders the sign-in screen for needs_credentials without redirecting", async () => {
    resolveAdminAuthState.mockResolvedValueOnce({ status: "needs_credentials" });

    const { default: HomePage } = await import("@/app/page");
    const screen = await HomePage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(screen);

    expect(html).toContain("Masuk");
    expect(html).toContain("Lupa kata sandi?");
    expect(html).toContain("Daftar Sekarang");
    expect(recordAdminAuthFunnelEvent).toHaveBeenCalledWith("admin_login_page_view");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("routes stale sessions to the explicit reauth page", async () => {
    resolveAdminAuthState.mockResolvedValueOnce({
      status: "stale_session",
      session: {},
    });

    const { default: HomePage } = await import("@/app/page");

    await expect(
      HomePage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("REDIRECT:/reauth-required");
  });
});
