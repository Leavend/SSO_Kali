import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createRemoteJWKSet = vi.fn();
const jwtVerify = vi.fn();
const remoteJwks = vi.fn();

vi.mock("jose", () => ({
  createRemoteJWKSet,
  jwtVerify,
}));

describe("jwt helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SSO_ISSUER = "http://sso.example";
    process.env.NEXT_PUBLIC_CLIENT_ID = "prototype-app-a";
    process.env.SSO_RESOURCE_AUDIENCE = "sso-resource-api";
    process.env.SSO_JWKS_URL = "http://sso.example/jwks";
    process.env.SSO_JWT_ALLOWED_ALGS = "ES256";
    process.env.SSO_JWT_CLOCK_SKEW_SECONDS = "60";
    createRemoteJWKSet.mockReturnValue(remoteJwks);
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SSO_ISSUER;
    delete process.env.NEXT_PUBLIC_CLIENT_ID;
    delete process.env.SSO_RESOURCE_AUDIENCE;
    delete process.env.SSO_JWKS_URL;
    delete process.env.SSO_JWT_ALLOWED_ALGS;
    delete process.env.SSO_JWT_CLOCK_SKEW_SECONDS;
  });

  it("verifies access tokens against the broker jwks", async () => {
    const payload = accessPayload();

    jwtVerify.mockResolvedValue({
      payload,
    });

    const { verifyAccessToken } = await import("@/lib/jwt");
    const claims = await verifyAccessToken("valid-access-token");

    expect(claims).toEqual({
      sid: "shared-sid",
      sub: "subject-123",
      clientId: "prototype-app-a",
      exp: payload.exp,
      email: "ada@example.com",
      name: "Ada Lovelace",
    });
    expect(String(createRemoteJWKSet.mock.calls[0]?.[0])).toBe("http://sso.example/jwks");
    expect(jwtVerify).toHaveBeenCalledWith("valid-access-token", remoteJwks, {
      issuer: "http://sso.example",
      audience: "sso-resource-api",
      algorithms: ["ES256"],
      clockTolerance: 60,
    });
  });

  it("rejects tampered access tokens when jose verification fails", async () => {
    jwtVerify.mockRejectedValue(new Error("signature verification failed"));

    const { verifyAccessToken } = await import("@/lib/jwt");

    await expect(verifyAccessToken("tampered-token")).rejects.toThrow("signature verification failed");
  });

  it("rejects id tokens that carry the wrong token_use", async () => {
    jwtVerify.mockResolvedValue({
      payload: {
        sub: "subject-123",
        nonce: "expected-nonce",
        iat: unixTime() - 5,
        exp: unixTime() + 300,
        token_use: "access",
      },
    });

    const { verifyIdToken } = await import("@/lib/jwt");

    await expect(verifyIdToken("id-token")).rejects.toThrow("Invalid id token payload.");
  });

  it("rejects access tokens without an iat claim", async () => {
    jwtVerify.mockResolvedValue({
      payload: {
        ...accessPayload(),
        iat: undefined,
      },
    });

    const { verifyAccessToken } = await import("@/lib/jwt");

    await expect(verifyAccessToken("missing-iat-token")).rejects.toThrow("Invalid iat claim.");
  });
});

function accessPayload() {
  return {
    sid: "shared-sid",
    sub: "subject-123",
    client_id: "prototype-app-a",
    iat: unixTime() - 5,
    exp: unixTime() + 300,
    email: "ada@example.com",
    name: "Ada Lovelace",
    token_use: "access",
  };
}

function unixTime(): number {
  return Math.floor(Date.now() / 1000);
}
