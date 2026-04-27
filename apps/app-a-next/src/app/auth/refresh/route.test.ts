import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const destroySession = vi.fn();
const findSession = vi.fn();
const getServerConfig = vi.fn();
const refreshTokens = vi.fn();
const releaseRefreshLock = vi.fn();
const replaceSessionTokens = vi.fn();
const tryAcquireRefreshLock = vi.fn();
const verifyAccessToken = vi.fn();
const waitForSessionRefresh = vi.fn();

vi.mock("@/lib/app-config", () => ({ getServerConfig }));
vi.mock("@/lib/jwt", () => ({ verifyAccessToken }));
vi.mock("@/lib/oidc", () => ({ refreshTokens }));
vi.mock("@/lib/session-store", () => ({
  destroySession,
  findSession,
  releaseRefreshLock,
  replaceSessionTokens,
  tryAcquireRefreshLock,
  waitForSessionRefresh,
}));

describe("POST /auth/refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerConfig.mockReturnValue(serverConfig());
    releaseRefreshLock.mockResolvedValue(undefined);
  });

  it("rotates the server-side refresh token and returns no token material", async () => {
    const current = session({ expiresAt: unixTime() + 10 });
    arrangeRotation(current);
    const { POST } = await import("@/app/auth/refresh/route");

    const response = await POST(refreshRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(JSON.stringify(body)).not.toContain("refresh-token-new");
    expect(replaceSessionTokens).toHaveBeenCalledWith("session-123", expect.objectContaining({
      refreshToken: "refresh-token-new",
    }));
    expect(releaseRefreshLock).toHaveBeenCalledWith("session-123");
  });

  it("keeps a fresh access token without unnecessary rotation", async () => {
    findSession.mockResolvedValue(session({ expiresAt: unixTime() + 900 }));
    const { POST } = await import("@/app/auth/refresh/route");

    const response = await POST(refreshRequest());

    expect(response.status).toBe(200);
    expect(tryAcquireRefreshLock).not.toHaveBeenCalled();
    expect(refreshTokens).not.toHaveBeenCalled();
  });

  it("expires the cookie when the session has no refresh token", async () => {
    const current = session({ expiresAt: unixTime() + 10, refreshToken: null });
    findSession.mockResolvedValue(current);
    tryAcquireRefreshLock.mockResolvedValue(true);
    const { POST } = await import("@/app/auth/refresh/route");

    const response = await POST(refreshRequest());

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toContain("__Host-app-a-session=");
    expect(destroySession).toHaveBeenCalledWith("session-123");
    expect(refreshTokens).not.toHaveBeenCalled();
  });

  it("waits for a peer tab instead of reusing the same refresh token", async () => {
    const current = session({ expiresAt: unixTime() + 10 });
    const refreshed = session({ expiresAt: unixTime() + 900, lastRefreshedAt: 20 });
    findSession.mockResolvedValue(current);
    tryAcquireRefreshLock.mockResolvedValue(false);
    waitForSessionRefresh.mockResolvedValue(refreshed);
    const { POST } = await import("@/app/auth/refresh/route");

    const response = await POST(refreshRequest());

    expect(response.status).toBe(200);
    expect(refreshTokens).not.toHaveBeenCalled();
  });

  it("destroys the session when refreshed token claims do not match", async () => {
    const current = session({ expiresAt: unixTime() + 10 });
    arrangeRotation(current, { sub: "attacker-subject" });
    const { POST } = await import("@/app/auth/refresh/route");

    const response = await POST(refreshRequest());

    expect(response.status).toBe(401);
    expect(destroySession).toHaveBeenCalledWith("session-123");
  });
});

function arrangeRotation(current: ReturnType<typeof session>, claims = {}) {
  findSession.mockResolvedValue(current);
  tryAcquireRefreshLock.mockResolvedValue(true);
  refreshTokens.mockResolvedValue({
    accessToken: "access-token-new",
    expiresIn: 900,
    idToken: "id-token-new",
    refreshToken: "refresh-token-new",
    scope: "openid profile email offline_access",
  });
  verifyAccessToken.mockResolvedValue({ ...accessClaims(), ...claims });
  replaceSessionTokens.mockResolvedValue(session({ expiresAt: unixTime() + 900 }));
}

function refreshRequest(): NextRequest {
  return new NextRequest("https://app-a.example/auth/refresh", {
    headers: { cookie: "__Host-app-a-session=session-123" },
    method: "POST",
  });
}

function session(overrides = {}) {
  return {
    accessToken: "access-token-old",
    clientId: "prototype-app-a",
    createdAt: 1,
    displayName: "Ada Lovelace",
    email: "ada@example.com",
    expiresAt: unixTime() + 900,
    idToken: "id-token-old",
    lastRefreshedAt: 1,
    lastTouchedAt: 1,
    profile: {
      display_name: "Ada Lovelace",
      email: "ada@example.com",
      mfa_required: false,
      risk_score: 15,
    },
    refreshToken: "refresh-token-old",
    sessionId: "session-123",
    sid: "shared-sid",
    subject: "subject-123",
    ...overrides,
  };
}

function accessClaims() {
  return {
    clientId: "prototype-app-a",
    email: "ada@example.com",
    exp: unixTime() + 900,
    name: "Ada Lovelace",
    sid: "shared-sid",
    sub: "subject-123",
  };
}

function serverConfig() {
  return {
    refreshLockTtlSeconds: 15,
    sessionAbsoluteTtlSeconds: 2_592_000,
    sessionCookieName: "__Host-app-a-session",
    sessionIdleTtlSeconds: 604_800,
  };
}

function unixTime(): number {
  return Math.floor(Date.now() / 1000);
}
