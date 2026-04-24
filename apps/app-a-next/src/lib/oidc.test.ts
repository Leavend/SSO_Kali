import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
  });

  it("builds an authorization code request with PKCE S256 and nonce", async () => {
    const { buildAuthorizeUrl, createAuthTransaction } = await import("@/lib/oidc");
    const transaction = createAuthTransaction();
    const url = new URL(buildAuthorizeUrl(transaction));

    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("state")).toBe(transaction.state);
    expect(url.searchParams.get("nonce")).toBe(transaction.nonce);
  });
});
