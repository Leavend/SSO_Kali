import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createRemoteJWKSet = vi.fn();
const fetchPrincipalWithAccessToken = vi.fn();
const getConfig = vi.fn();
const jwtVerify = vi.fn();
const pullTransaction = vi.fn();
const recordAdminAuthFunnelEvent = vi.fn();
const recordForbiddenAttempt = vi.fn();
const sessionFromBootstrap = vi.fn();
const setSession = vi.fn();

vi.mock("jose", () => ({
  createRemoteJWKSet,
  jwtVerify,
}));

vi.mock("@/lib/config", () => ({
  getConfig,
}));

vi.mock("@/lib/admin-api", () => ({
  fetchPrincipalWithAccessToken,
}));

vi.mock("@/lib/admin-auth-funnel", () => ({
  recordAdminAuthFunnelEvent,
}));

vi.mock("@/lib/rbac-telemetry", () => ({
  recordForbiddenAttempt,
}));

vi.mock("@/lib/session", () => ({
  pullTransaction,
  sessionFromBootstrap,
  setSession,
}));

describe("admin auth callback", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("SESSION_ENCRYPTION_SECRET", "test-session-secret-at-least-32-characters");
    createRemoteJWKSet.mockReturnValue(Symbol("jwks"));
    getConfig.mockReturnValue({
      adminApiUrl: "http://localhost:8200/admin/api",
      appBaseUrl: "http://localhost:3000",
      clientId: "sso-admin-panel",
      issuer: "http://localhost:8200",
      jwksUrl: "http://localhost:8200/jwks",
      redirectUri: "http://localhost:3000/auth/callback",
      tokenUrl: "http://localhost:8200/token",
    });
    jwtVerify.mockResolvedValue({
      payload: {
        email: "admin@example.com",
        exp: 1_900_000_000,
        name: "Admin",
        nonce: "nonce",
        sub: "123456789",
      },
    });
    fetchPrincipalWithAccessToken.mockResolvedValue({
      subject_id: "123456789",
      email: "admin@example.com",
      display_name: "Admin",
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
    });
    pullTransaction.mockResolvedValue({
      codeVerifier: "verifier",
      nonce: "nonce",
      state: "state-123",
    });
    sessionFromBootstrap.mockReturnValue({
      accessToken: "access-token",
      idToken: "id-token",
      refreshToken: "refresh-token",
      sub: "123456789",
      email: "admin@example.com",
      displayName: "Admin",
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
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("redirects forbidden users to /access-denied and records telemetry", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(tokenResponse());
    fetchPrincipalWithAccessToken.mockRejectedValueOnce({
      code: "forbidden",
      message: "forbidden",
      name: "AdminApiError",
      status: 403,
    });

    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/auth/callback/route");
    const request = new NextRequest("https://dev-sso.timeh.my.id/auth/callback?code=code-123&state=state-123");
    const response = await GET(request);

    expect(response.headers.get("location")).toBe("http://localhost:3000/access-denied");
    expect(recordForbiddenAttempt).toHaveBeenCalledWith(expect.objectContaining({
      pathname: "/auth/callback",
      reason: "admin_api_denied",
      status: 403,
      subjectId: "123456789",
    }));
    expect(setSession).not.toHaveBeenCalled();
  });

  it("redirects upstream callback errors to the invalid-credentials page", async () => {
    const { GET } = await import("@/app/auth/callback/route");
    const request = new NextRequest("https://dev-sso.timeh.my.id/auth/callback?error=access_denied&state=state-123");
    const response = await GET(request);

    expect(response.headers.get("location")).toBe("http://localhost:3000/invalid-credentials");
    expect(fetchPrincipalWithAccessToken).not.toHaveBeenCalled();
  });

  it("redirects broker invalid_request errors to the handshake-failed page", async () => {
    const { GET } = await import("@/app/auth/callback/route");
    const request = new NextRequest("https://dev-sso.timeh.my.id/auth/callback?error=invalid_request&state=state-123");
    const response = await GET(request);

    expect(response.headers.get("location")).toBe("http://localhost:3000/handshake-failed");
    expect(fetchPrincipalWithAccessToken).not.toHaveBeenCalled();
  });

  it("redirects state mismatches to the handshake-failed page", async () => {
    const fetchMock = vi.fn();
    pullTransaction.mockResolvedValueOnce({
      codeVerifier: "verifier",
      nonce: "nonce",
      state: "different-state",
    });

    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/auth/callback/route");
    const request = new NextRequest("https://dev-sso.timeh.my.id/auth/callback?code=code-123&state=state-123");
    const response = await GET(request);

    expect(response.headers.get("location")).toBe("http://localhost:3000/handshake-failed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("redirects stale admin sessions to the reauth-required page", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(tokenResponse());
    fetchPrincipalWithAccessToken.mockRejectedValueOnce({
      code: "reauth_required",
      message: "reauth required",
      name: "AdminApiError",
      status: 401,
    });

    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/auth/callback/route");
    const request = new NextRequest("https://dev-sso.timeh.my.id/auth/callback?code=code-123&state=state-123");
    const response = await GET(request);

    expect(response.headers.get("location")).toBe("http://localhost:3000/reauth-required");
  });

  it("redirects mfa-required failures to the dedicated MFA page", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(tokenResponse());
    fetchPrincipalWithAccessToken.mockRejectedValueOnce({
      code: "mfa_required",
      message: "mfa required",
      name: "AdminApiError",
      status: 401,
    });

    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/auth/callback/route");
    const request = new NextRequest("https://dev-sso.timeh.my.id/auth/callback?code=code-123&state=state-123");
    const response = await GET(request);

    expect(response.headers.get("location")).toBe("http://localhost:3000/mfa-required");
  });

  it("redirects rate-limited callbacks to the too-many-attempts page", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(tokenResponse());
    fetchPrincipalWithAccessToken.mockRejectedValueOnce({
      code: "too_many_attempts",
      message: "too many attempts",
      name: "AdminApiError",
      status: 429,
    });

    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/auth/callback/route");
    const request = new NextRequest("https://dev-sso.timeh.my.id/auth/callback?code=code-123&state=state-123");
    const response = await GET(request);

    expect(response.headers.get("location")).toBe("http://localhost:3000/too-many-attempts");
  });

  it("maps upstream callback MFA errors before token exchange", async () => {
    const { GET } = await import("@/app/auth/callback/route");
    const request = new NextRequest("https://dev-sso.timeh.my.id/auth/callback?error=mfa_required&state=state-123");
    const response = await GET(request);

    expect(response.headers.get("location")).toBe("http://localhost:3000/mfa-required");
  });

  it("maps upstream callback throttling errors before token exchange", async () => {
    const { GET } = await import("@/app/auth/callback/route");
    const request = new NextRequest("https://dev-sso.timeh.my.id/auth/callback?error=too_many_attempts&state=state-123");
    const response = await GET(request);

    expect(response.headers.get("location")).toBe("http://localhost:3000/too-many-attempts");
  });

  it("bootstraps the session from /admin/api/me after token exchange", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(tokenResponse());

    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/auth/callback/route");
    const request = new NextRequest("https://dev-sso.timeh.my.id/auth/callback?code=code-123&state=state-123");
    const response = await GET(request);

    expect(jwtVerify).toHaveBeenCalledWith(
      "id-token",
      expect.anything(),
      expect.objectContaining({
        audience: "sso-admin-panel",
        issuer: "http://localhost:8200",
      }),
    );
    expect(fetchPrincipalWithAccessToken).toHaveBeenCalledWith("access-token");
    expect(sessionFromBootstrap).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: "access-token",
      expiresAt: expect.any(Number),
      idToken: "id-token",
      refreshToken: "refresh-token",
    }), expect.objectContaining({
      subject_id: "123456789",
    }));
    expect(recordAdminAuthFunnelEvent).toHaveBeenCalledWith("admin_login_success");
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("__Secure-admin-session");
    expect(setCookie).toContain("__Secure-admin-tx");
    expect(response.headers.get("location")).toBe("http://localhost:3000/dashboard");
  });

  it("fails closed when the bootstrapped principal subject does not match the verified ID token", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(tokenResponse());
    fetchPrincipalWithAccessToken.mockResolvedValueOnce({
      subject_id: "different-subject",
      email: "admin@example.com",
      display_name: "Admin",
      role: "admin",
      last_login_at: "2026-04-05T12:00:00Z",
      auth_context: {
        auth_time: 1_800_000_000,
        amr: ["pwd", "otp", "mfa"],
        acr: "urn:example:loa:2",
      },
      permissions: {
        view_admin_panel: true,
        manage_sessions: true,
      },
    });

    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/auth/callback/route");
    const request = new NextRequest("https://dev-sso.timeh.my.id/auth/callback?code=code-123&state=state-123");
    const response = await GET(request);

    expect(response.headers.get("location")).toBe("http://localhost:3000/handshake-failed");
    expect(setSession).not.toHaveBeenCalled();
  });

  it("redirects back to the requested admin page when return_to exists", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(tokenResponse());
    pullTransaction.mockResolvedValueOnce({
      codeVerifier: "verifier",
      nonce: "nonce",
      state: "state-123",
      returnTo: "/sessions",
    });

    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/auth/callback/route");
    const request = new NextRequest("https://dev-sso.timeh.my.id/auth/callback?code=code-123&state=state-123");
    const response = await GET(request);

    expect(response.headers.get("location")).toBe("http://localhost:3000/sessions");
  });
});

function tokenResponse(): Response {
  return jsonResponse({
    access_token: "access-token",
    expires_in: 3600,
    id_token: "id-token",
    refresh_token: "refresh-token",
  });
}

function jsonResponse(payload: object): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json",
    },
    status: 200,
  });
}
