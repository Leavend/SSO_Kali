import { createHash, randomBytes } from "node:crypto";
import { getServerConfig } from "@/lib/app-config";

export type AuthTransaction = {
  readonly state: string;
  readonly codeVerifier: string;
  readonly nonce: string;
};

export type TokenBundle = {
  readonly accessToken: string;
  readonly idToken: string;
  readonly refreshToken: string | null;
  readonly expiresIn: number;
  readonly scope: string;
};

export type ResourceProfile = {
  readonly subject_id: string;
  readonly email: string;
  readonly display_name: string;
  readonly login_context: {
    readonly risk_score: number;
    readonly mfa_required: boolean;
  };
};

type TokenResponse = {
  readonly access_token: string;
  readonly id_token: string;
  readonly refresh_token?: string;
  readonly expires_in: number;
  readonly scope: string;
};

type ResourceProfileResponse = {
  readonly resource_profile: ResourceProfile;
};

export function createAuthTransaction(): AuthTransaction {
  return {
    state: randomToken(24),
    codeVerifier: randomToken(48),
    nonce: randomToken(16),
  };
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function buildAuthorizeUrl(transaction: AuthTransaction, prompt?: string): string {
  const config = getServerConfig();
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    response_type: "code",
    scope: "openid profile email offline_access",
    state: transaction.state,
    nonce: transaction.nonce,
    code_challenge: pkceChallenge(transaction.codeVerifier),
    code_challenge_method: "S256",
  });

  if (prompt) {
    params.set("prompt", prompt);
  }

  return `${config.authorizeUrl}?${params.toString()}`;
}

export async function exchangeCode(code: string, verifier: string): Promise<TokenBundle> {
  const config = getServerConfig();
  const payload = await postJson<TokenResponse>(config.tokenUrl, {
    grant_type: "authorization_code",
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    code,
    code_verifier: verifier,
  });

  return {
    accessToken: payload.access_token,
    idToken: payload.id_token,
    refreshToken: payload.refresh_token ?? null,
    expiresIn: payload.expires_in,
    scope: payload.scope,
  };
}

export async function refreshTokens(refreshToken: string): Promise<TokenBundle> {
  const config = getServerConfig();
  const payload = await postJson<TokenResponse>(config.tokenUrl, {
    grant_type: "refresh_token",
    client_id: config.clientId,
    refresh_token: refreshToken,
  });

  return tokenBundle(payload);
}

export async function fetchProfile(accessToken: string): Promise<ResourceProfile> {
  const config = getServerConfig();
  const payload = await fetchJson<ResourceProfileResponse>(config.profileUrl, accessToken);

  return payload.resource_profile;
}

export async function registerSession(accessToken: string): Promise<void> {
  await postJson(getServerConfig().registerSessionUrl, {}, accessToken);
}

export async function logoutSession(accessToken: string): Promise<void> {
  await postJson(getServerConfig().logoutUrl, {}, accessToken);
}

async function fetchJson<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  return parseResponse<T>(response);
}

async function postJson<T>(url: string, body: object, accessToken?: string): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: headers(accessToken),
    body: JSON.stringify(body),
    cache: "no-store",
  });

  return parseResponse<T>(response);
}

function tokenBundle(payload: TokenResponse): TokenBundle {
  return {
    accessToken: payload.access_token,
    idToken: payload.id_token,
    refreshToken: payload.refresh_token ?? null,
    expiresIn: payload.expires_in,
    scope: payload.scope,
  };
}

function headers(accessToken?: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`OIDC request failed with status ${response.status}.`);
  }

  return (await response.json()) as T;
}

function randomToken(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}
