import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const buildAuthorizeUrl = vi.fn();
const generateCodeChallenge = vi.fn();
const generateCodeVerifier = vi.fn();
const generateNonce = vi.fn();
const generateState = vi.fn();
const normalizeReturnTo = vi.fn();
const recordAdminAuthFunnelEvent = vi.fn();
const setTransaction = vi.fn();

vi.mock("@/lib/pkce", () => ({
  buildAuthorizeUrl,
  generateCodeChallenge,
  generateCodeVerifier,
  generateNonce,
  generateState,
}));

vi.mock("@/lib/admin-auth-funnel", () => ({
  recordAdminAuthFunnelEvent,
}));

vi.mock("@/lib/admin-login-url", () => ({
  normalizeReturnTo,
}));

vi.mock("@/lib/session", () => ({
  setTransaction,
}));

describe("admin auth login route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    generateState.mockReturnValue("state-123");
    generateNonce.mockReturnValue("nonce-123");
    generateCodeVerifier.mockReturnValue("verifier-123");
    generateCodeChallenge.mockResolvedValue("challenge-123");
    normalizeReturnTo.mockReturnValue("/sessions");
    buildAuthorizeUrl.mockReturnValue(
      "https://dev-sso.timeh.my.id/authorize?state=state-123",
    );
  });

  it("records login start telemetry before redirecting to the broker", async () => {
    const { GET } = await import("@/app/auth/login/route");
    const request = new NextRequest(
      "https://dev-sso.timeh.my.id/auth/login?return_to=/sessions",
    );
    const response = await GET(request);

    expect(setTransaction).toHaveBeenCalledWith({
      state: "state-123",
      nonce: "nonce-123",
      codeVerifier: "verifier-123",
      returnTo: "/sessions",
    });
    expect(recordAdminAuthFunnelEvent).toHaveBeenCalledWith("admin_login_started");
    expect(response.headers.get("location")).toBe(
      "https://dev-sso.timeh.my.id/authorize?state=state-123",
    );
  });
});
