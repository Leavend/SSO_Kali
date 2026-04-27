import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("oidc authorize url", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_AUTHORIZE_URL = "https://sso.example/authorize";
    process.env.NEXT_PUBLIC_CLIENT_ID = "prototype-app-a";
    process.env.NEXT_PUBLIC_CALLBACK_URL = "https://app-a.example/auth/callback";
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_AUTHORIZE_URL;
    delete process.env.NEXT_PUBLIC_CLIENT_ID;
    delete process.env.NEXT_PUBLIC_CALLBACK_URL;
    delete process.env.SSO_TOKEN_URL;
    vi.unstubAllGlobals();
  });

  it("builds an authorization code request with PKCE S256 and nonce", async () => {
    const { buildAuthorizeUrl, createAuthTransaction } = await import("@/lib/oidc");
    const transaction = createAuthTransaction();
    const url = new URL(buildAuthorizeUrl(transaction));

    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("scope")).toContain("offline_access");
    expect(url.searchParams.get("state")).toBe(transaction.state);
    expect(url.searchParams.get("nonce")).toBe(transaction.nonce);
  });

  it("exchanges refresh tokens through the broker without exposing tokens to storage", async () => {
    process.env.SSO_TOKEN_URL = "https://sso.example/token";
    const fetchMock = vi.fn().mockResolvedValue(tokenResponse());
    vi.stubGlobal("fetch", fetchMock);
    const { refreshTokens } = await import("@/lib/oidc");

    const tokens = await refreshTokens("refresh-token-old");

    expect(tokens.refreshToken).toBe("refresh-token-new");
    expect(fetchMock).toHaveBeenCalledWith("https://sso.example/token", expect.objectContaining({
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: "prototype-app-a",
        refresh_token: "refresh-token-old",
      }),
      method: "POST",
    }));
  });
});

function tokenResponse(): Response {
  return new Response(JSON.stringify({
    access_token: "access-token-new",
    expires_in: 900,
    id_token: "id-token-new",
    refresh_token: "refresh-token-new",
    scope: "openid profile email offline_access",
  }));
}
