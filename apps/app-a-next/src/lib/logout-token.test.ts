import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createRemoteJWKSet = vi.fn();
const jwtVerify = vi.fn();
const remoteJwks = vi.fn();
const rememberLogoutTokenJti = vi.fn();

vi.mock("jose", () => ({
  createRemoteJWKSet,
  jwtVerify,
}));

vi.mock("@/lib/logout-replay-store", () => ({
  rememberLogoutTokenJti,
}));

describe("logout token verifier", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SSO_ISSUER = "http://sso.example";
    process.env.NEXT_PUBLIC_CLIENT_ID = "prototype-app-a";
    process.env.SSO_JWKS_URL = "http://sso.example/jwks";
    process.env.SSO_JWT_ALLOWED_ALGS = "ES256";
    process.env.SSO_JWT_CLOCK_SKEW_SECONDS = "60";
    createRemoteJWKSet.mockReturnValue(remoteJwks);
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SSO_ISSUER;
    delete process.env.NEXT_PUBLIC_CLIENT_ID;
    delete process.env.SSO_JWKS_URL;
    delete process.env.SSO_JWT_ALLOWED_ALGS;
    delete process.env.SSO_JWT_CLOCK_SKEW_SECONDS;
  });

  it("verifies logout tokens with the configured JWT policy", async () => {
    jwtVerify.mockResolvedValue({
      payload: {
        jti: "logout-jti-1",
        sid: "shared-sid",
        sub: "subject-123",
        iat: unixTime() - 5,
        exp: unixTime() + 300,
        events: {
          "http://schemas.openid.net/event/backchannel-logout": {},
        },
      },
    });

    const { verifyLogoutToken } = await import("@/lib/logout-token");
    const claims = await verifyLogoutToken("logout-token");

    expect(claims).toEqual({ jti: "logout-jti-1", sid: "shared-sid", sub: "subject-123" });
    expect(jwtVerify).toHaveBeenCalledWith("logout-token", remoteJwks, {
      issuer: "http://sso.example",
      audience: "prototype-app-a",
      algorithms: ["ES256"],
      clockTolerance: 60,
    });
    expect(rememberLogoutTokenJti).toHaveBeenCalledWith("logout-jti-1", expect.any(Number));
  });

  it("rejects logout tokens without an issued-at claim", async () => {
    jwtVerify.mockResolvedValue({
      payload: {
        jti: "logout-jti-2",
        sid: "shared-sid",
        exp: unixTime() + 300,
        events: {
          "http://schemas.openid.net/event/backchannel-logout": {},
        },
      },
    });

    const { verifyLogoutToken } = await import("@/lib/logout-token");

    await expect(verifyLogoutToken("logout-token")).rejects.toThrow("Invalid logout token.");
  });

  it("rejects logout tokens without back-channel logout events", async () => {
    jwtVerify.mockResolvedValue({ payload: validPayload({ events: {} }) });

    const { verifyLogoutToken } = await import("@/lib/logout-token");

    await expect(verifyLogoutToken("logout-token")).rejects.toThrow("Invalid logout token.");
  });

  it("rejects logout tokens without an expiration claim", async () => {
    jwtVerify.mockResolvedValue({ payload: validPayload({ exp: undefined }) });

    const { verifyLogoutToken } = await import("@/lib/logout-token");

    await expect(verifyLogoutToken("logout-token")).rejects.toThrow("Invalid logout token.");
    expect(rememberLogoutTokenJti).not.toHaveBeenCalled();
  });

  it("rejects logout tokens that omit both subject and sid", async () => {
    jwtVerify.mockResolvedValue({ payload: validPayload({ sid: undefined, sub: undefined }) });

    const { verifyLogoutToken } = await import("@/lib/logout-token");

    await expect(verifyLogoutToken("logout-token")).rejects.toThrow("Invalid logout token.");
    expect(rememberLogoutTokenJti).not.toHaveBeenCalled();
  });

  it("rejects logout tokens that contain a nonce claim", async () => {
    jwtVerify.mockResolvedValue({ payload: validPayload({ nonce: "forbidden" }) });

    const { verifyLogoutToken } = await import("@/lib/logout-token");

    await expect(verifyLogoutToken("logout-token")).rejects.toThrow("Invalid logout token.");
    expect(rememberLogoutTokenJti).not.toHaveBeenCalled();
  });

  it("rejects logout tokens when jose reports them as expired", async () => {
    jwtVerify.mockRejectedValue(new Error("JWTExpired"));

    const { verifyLogoutToken } = await import("@/lib/logout-token");

    await expect(verifyLogoutToken("logout-token")).rejects.toThrow("JWTExpired");
    expect(rememberLogoutTokenJti).not.toHaveBeenCalled();
  });
});

function validPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    jti: "logout-jti-default",
    sid: "shared-sid",
    sub: "subject-123",
    iat: unixTime() - 5,
    exp: unixTime() + 300,
    events: {
      "http://schemas.openid.net/event/backchannel-logout": {},
    },
    ...overrides,
  };
}

function unixTime(): number {
  return Math.floor(Date.now() / 1000);
}
