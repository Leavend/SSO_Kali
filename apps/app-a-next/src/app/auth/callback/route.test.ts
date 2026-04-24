import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCode = vi.fn();
const fetchProfile = vi.fn();
const registerSession = vi.fn();
const verifyAccessToken = vi.fn();
const verifyIdToken = vi.fn();
const createSession = vi.fn();
const pullAuthTransaction = vi.fn();
const getServerConfig = vi.fn();

vi.mock("@/lib/app-config", () => ({
  getServerConfig,
}));

vi.mock("@/lib/oidc", () => ({
  exchangeCode,
  fetchProfile,
  registerSession,
}));

vi.mock("@/lib/jwt", () => ({
  verifyAccessToken,
  verifyIdToken,
}));

vi.mock("@/lib/session-store", () => ({
  createSession,
  pullAuthTransaction,
}));

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerConfig.mockReturnValue(serverConfig());
  });

  it("creates a session cookie after a valid broker callback", async () => {
    arrangeValidCallback();
    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(callbackRequest());

    expect(response.headers.get("location")).toBe("http://app-a.example/?event=connected");
    expect(response.headers.get("set-cookie")).toContain("__Host-app-a-session=session-123");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(response.headers.get("set-cookie")).toContain("Path=/");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
    expect(response.headers.get("set-cookie")).not.toContain("Domain=");
    expect(fetchProfile).toHaveBeenCalledWith("access-token");
    expect(registerSession).toHaveBeenCalledWith("access-token");
  });

  it("rejects the callback when the nonce does not match", async () => {
    arrangeValidCallback();
    verifyIdToken.mockResolvedValue({
      sub: "subject-123",
      nonce: "wrong-nonce",
      exp: 1_900_000_000,
    });
    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(callbackRequest());

    expect(response.headers.get("location")).toBe("http://app-a.example/?event=nonce-mismatch");
    expect(createSession).not.toHaveBeenCalled();
    expect(fetchProfile).not.toHaveBeenCalled();
    expect(registerSession).not.toHaveBeenCalled();
  });

  it("rejects the callback when the token subject does not match", async () => {
    arrangeValidCallback();
    verifyIdToken.mockResolvedValue({
      sub: "another-subject",
      nonce: "expected-nonce",
      exp: 1_900_000_000,
    });
    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(callbackRequest());

    expect(response.headers.get("location")).toBe("http://app-a.example/?event=handshake-failed");
    expect(createSession).not.toHaveBeenCalled();
    expect(registerSession).not.toHaveBeenCalled();
  });
});

function arrangeValidCallback(): void {
  pullAuthTransaction.mockResolvedValue({
    codeVerifier: "verifier-123",
    nonce: "expected-nonce",
  });
  exchangeCode.mockResolvedValue({
    accessToken: "access-token",
    refreshToken: "refresh-token",
    idToken: "id-token",
  });
  verifyAccessToken.mockResolvedValue({
    sid: "shared-sid",
    sub: "subject-123",
    clientId: "prototype-app-a",
    email: "ada@example.com",
    name: "Ada Lovelace",
    exp: 1_900_000_000,
  });
  verifyIdToken.mockResolvedValue({
    sub: "subject-123",
    nonce: "expected-nonce",
    exp: 1_900_000_000,
  });
  fetchProfile.mockResolvedValue({
    email: "ada@example.com",
    display_name: "Ada Lovelace",
    login_context: {
      risk_score: 15,
      mfa_required: false,
    },
  });
  createSession.mockResolvedValue({
    sessionId: "session-123",
  });
  registerSession.mockResolvedValue(undefined);
}

function callbackRequest(): NextRequest {
  return new NextRequest("http://app-a.example/auth/callback?code=auth-code&state=client-state");
}

function serverConfig() {
  return {
    baseUrl: "http://app-a.example",
    issuer: "http://sso.example",
    clientId: "prototype-app-a",
    resourceAudience: "sso-resource-api",
    jwtAllowedAlgorithms: ["ES256"],
    jwtClockSkewSeconds: 60,
    authorizeUrl: "http://sso.example/authorize",
    callbackUrl: "http://app-a.example/auth/callback",
    tokenUrl: "http://sso.example/token",
    profileUrl: "http://sso.example/api/profile",
    registerSessionUrl: "http://sso.example/connect/register-session",
    logoutUrl: "http://sso.example/connect/logout",
    jwksUrl: "http://sso.example/jwks",
    redisUrl: "redis://127.0.0.1:6379/1",
    sessionCookieName: "__Host-app-a-session",
  };
}
