import { NextRequest, NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { fetchPrincipalWithAccessToken } from "@/lib/admin-api";
import {
  isAdminApiError,
  isMfaRequiredApiError,
  isReauthRequiredApiError,
  isTooManyAttemptsApiError,
} from "@/lib/admin-api-error";
import { recordAdminAuthFunnelEvent } from "@/lib/admin-auth-funnel";
import { normalizeReturnTo } from "@/lib/admin-login-url";
import {
  ACCESS_DENIED_ROUTE,
  HANDSHAKE_FAILED_ROUTE,
  INVALID_CREDENTIALS_ROUTE,
  MFA_REQUIRED_ROUTE,
  REAUTH_REQUIRED_ROUTE,
  TOO_MANY_ATTEMPTS_ROUTE,
} from "@/lib/auth-status-routes";
import { getConfig } from "@/lib/config";
import { recordForbiddenAttempt } from "@/lib/rbac-telemetry";
import { pullTransaction, sessionFromBootstrap } from "@/lib/session";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const config = getConfig();
  const params = readCallbackParams(request);

  const earlyRedirect = validateCallback(params, config);
  if (earlyRedirect) return earlyRedirect;

  const tx = await pullTransaction();
  if (!tx || tx.state !== params.state) {
    return redirectTo(config.appBaseUrl, HANDSHAKE_FAILED_ROUTE);
  }

  return processTokenExchange(config, params.code!, tx);
}

async function processTokenExchange(
  config: ReturnType<typeof getConfig>,
  code: string,
  tx: NonNullable<Awaited<ReturnType<typeof pullTransaction>>>,
): Promise<NextResponse> {
  let verifiedSubjectId: string | null = null;

  try {
    const tokens = await exchangeCode(code, tx.codeVerifier);
    const claims = await verifyIdToken(tokens.id_token, tx.nonce);
    verifiedSubjectId = claims.sub;

    return await handleCallbackSuccess(config, tokens, claims, tx);
  } catch (error) {
    return handleCallbackError(config, error, verifiedSubjectId);
  }
}

async function handleCallbackSuccess(
  config: ReturnType<typeof getConfig>,
  tokens: { access_token: string; id_token: string; refresh_token: string; expires_in: number },
  claims: { sub: string; exp: number },
  tx: { returnTo?: string },
): Promise<NextResponse> {
  const principal = await fetchPrincipalWithAccessToken(tokens.access_token);
  assertPrincipalSubject(principal.subject_id, claims.sub);

  // Use the access token's expires_in (typically 3600s) for session lifetime,
  // NOT the ID token's exp claim which reflects the short-lived ID token TTL
  // (ZITADEL default ~720s). The ID token exp was causing sessions to be
  // treated as expired after ~12 minutes even though the access token is
  // valid for 1 hour.
  const accessTokenExpiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;

  const session = sessionFromBootstrap({
    accessToken: tokens.access_token,
    idToken: tokens.id_token,
    refreshToken: tokens.refresh_token,
    expiresAt: accessTokenExpiresAt,
  }, principal);

  // Build redirect response FIRST, then attach cookies directly on it.
  // cookies().set() from next/headers does NOT reliably attach
  // Set-Cookie headers to a separately constructed NextResponse.redirect().
  const response = redirectTo(config.appBaseUrl, normalizeReturnTo(tx.returnTo) ?? "/dashboard");

  const { encryptSession } = await import("@/lib/session-crypto");
  const { ADMIN_SESSION_COOKIE, ADMIN_TX_COOKIE, hostCookieOptions, expiredHostCookieOptions } = await import("@/lib/cookie-policy");

  response.cookies.set(ADMIN_SESSION_COOKIE, encryptSession(JSON.stringify(session)), hostCookieOptions(3600));
  response.cookies.set(ADMIN_TX_COOKIE, "", expiredHostCookieOptions());

  recordAdminAuthFunnelEvent("admin_login_success");

  return response;
}

function handleCallbackError(
  config: ReturnType<typeof getConfig>,
  error: unknown,
  verifiedSubjectId: string | null,
): NextResponse {
  logCallbackFailure(error, verifiedSubjectId);

  // Specific error codes MUST be checked before the generic 403 status,
  // because MFA-required and reauth-required also return HTTP 403.
  if (isMfaRequiredApiError(error)) {
    return redirectTo(config.appBaseUrl, MFA_REQUIRED_ROUTE);
  }

  if (isReauthRequiredApiError(error)) {
    return redirectTo(config.appBaseUrl, REAUTH_REQUIRED_ROUTE);
  }

  if (isTooManyAttemptsApiError(error)) {
    return redirectTo(config.appBaseUrl, TOO_MANY_ATTEMPTS_ROUTE);
  }

  if (isAdminApiError(error) && error.status === 403) {
    recordCallbackForbidden(error.status, verifiedSubjectId);
    return redirectTo(config.appBaseUrl, ACCESS_DENIED_ROUTE);
  }

  return redirectTo(config.appBaseUrl, HANDSHAKE_FAILED_ROUTE);
}

function logCallbackFailure(error: unknown, subjectId: string | null): void {
  const payload = {
    event: "admin_auth_callback_failed",
    subjectId,
    ...serializeCallbackError(error),
  };

  console.error(JSON.stringify(payload));
}

function serializeCallbackError(error: unknown): Record<string, unknown> {
  if (isAdminApiError(error)) {
    return {
      kind: "admin_api_error",
      status: error.status,
      code: error.code ?? null,
      message: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      kind: "error",
      name: error.name,
      message: error.message,
    };
  }

  return {
    kind: "unknown",
    message: String(error),
  };
}

function recordCallbackForbidden(status: number, subjectId: string | null): void {
  recordForbiddenAttempt({
    pathname: "/auth/callback",
    reason: "admin_api_denied",
    role: "unknown",
    status,
    ...(subjectId ? { subjectId } : {}),
  });
}

function assertPrincipalSubject(principalSubjectId: string, verifiedSubjectId: string): void {
  if (principalSubjectId !== verifiedSubjectId) {
    throw new Error("Admin principal subject does not match the verified ID token subject.");
  }
}

function validateCallback(
  params: ReturnType<typeof readCallbackParams>,
  config: ReturnType<typeof getConfig>,
): NextResponse | null {
  if (params.error) {
    return redirectTo(config.appBaseUrl, callbackErrorRoute(params.error));
  }

  if (!hasValidCallback(params)) {
    return redirectTo(config.appBaseUrl, HANDSHAKE_FAILED_ROUTE);
  }

  return null;
}

function callbackErrorRoute(error: string): string {
  switch (error) {
    case "mfa_required":
      return MFA_REQUIRED_ROUTE;
    case "too_many_attempts":
      return TOO_MANY_ATTEMPTS_ROUTE;
    case "invalid_request":
    case "temporarily_unavailable":
    case "server_error":
      return HANDSHAKE_FAILED_ROUTE;
    default:
      return INVALID_CREDENTIALS_ROUTE;
  }
}

function readCallbackParams(request: NextRequest) {
  return {
    code: request.nextUrl.searchParams.get("code"),
    error: request.nextUrl.searchParams.get("error"),
    state: request.nextUrl.searchParams.get("state"),
  };
}

function hasValidCallback(params: {
  code: string | null;
  error: string | null;
  state: string | null;
}): params is { code: string; error: string | null; state: string } {
  return typeof params.state === "string" && typeof params.code === "string";
}

type TokenSet = { access_token: string; id_token: string; refresh_token: string; expires_in: number };

async function exchangeCode(code: string, codeVerifier: string): Promise<TokenSet> {
  const config = getConfig();
  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: buildTokenParams(config, code, codeVerifier),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Token exchange failed: HTTP ${res.status} — ${body}`);
  }

  return res.json() as Promise<TokenSet>;
}

function buildTokenParams(
  config: ReturnType<typeof getConfig>,
  code: string,
  codeVerifier: string,
): URLSearchParams {
  return new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    code,
    redirect_uri: config.redirectUri,
    code_verifier: codeVerifier,
  });
}

async function verifyIdToken(token: string, expectedNonce: string) {
  const config = getConfig();
  const jwks = createRemoteJWKSet(new URL(config.jwksUrl));
  const { payload } = await jwtVerify(token, jwks, {
    issuer: config.issuer,
    audience: config.clientId,
  });

  return extractVerifiedClaims(payload, expectedNonce);
}

function extractVerifiedClaims(payload: Record<string, unknown>, expectedNonce: string) {
  const sub = payload.sub;
  const exp = payload.exp;
  const nonce = payload.nonce;

  if (typeof sub !== "string" || sub === "") {
    throw new Error("ID token is missing a valid 'sub' claim.");
  }

  if (typeof exp !== "number") {
    throw new Error("ID token is missing a valid 'exp' claim.");
  }

  if (nonce !== expectedNonce) {
    throw new Error("ID token nonce validation failed.");
  }

  return {
    sub,
    email: typeof payload.email === "string" ? payload.email : "",
    name: typeof payload.name === "string" ? payload.name : null,
    exp,
  };
}

function redirectTo(appBaseUrl: string, pathname: string): NextResponse {
  return NextResponse.redirect(new URL(pathname, appBaseUrl));
}
