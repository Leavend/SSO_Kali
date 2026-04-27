import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerConfig } from "@/lib/app-config";
import { hostSessionCookieOptions } from "@/lib/cookie-policy";
import { verifyAccessToken, verifyIdToken, type AccessTokenClaims } from "@/lib/jwt";
import { exchangeCode, fetchProfile, registerSession, type TokenBundle } from "@/lib/oidc";
import { createSession, pullAuthTransaction, type StoredAuthTransaction } from "@/lib/session-store";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const errorResponse = await upstreamErrorResponse(request);
  if (errorResponse !== null) return errorResponse;

  const params = callbackParams(request);
  if (params === null) return redirectToHome("event=missing-code");

  const transaction = await pullAuthTransaction(params.state);
  if (transaction === null) return redirectToHome("event=expired-state");

  return completeCallback(params.code, transaction);
}

async function upstreamErrorResponse(request: NextRequest): Promise<NextResponse | null> {
  const error = request.nextUrl.searchParams.get("error");
  const state = request.nextUrl.searchParams.get("state");

  if (error === null) return null;
  if (state !== null) await pullAuthTransaction(state);

  // Silent SSO check failed — no active ZITADEL session.
  // Redirect to landing with sso_checked=1 to show manual login button
  // instead of looping back into prompt=none.
  if (error === "login_required" || error === "interaction_required") {
    return redirectToHome("sso_checked=1");
  }

  return redirectToHome("event=upstream-error");
}

function callbackParams(request: NextRequest): { state: string; code: string } | null {
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");

  if (state === null || code === null) return null;

  return { state, code };
}

async function completeCallback(
  code: string,
  transaction: StoredAuthTransaction,
): Promise<NextResponse> {
  try {
    const tokens = await exchangeCode(code, transaction.codeVerifier);
    const accessClaims = await verifyAccessToken(tokens.accessToken);
    const idClaims = await verifyIdToken(tokens.idToken);
    if (!sameValue(idClaims.nonce, transaction.nonce)) return redirectToHome("event=nonce-mismatch");
    assertMatchingSubject(accessClaims.sub, idClaims.sub);
    const session = await persistSession(tokens, accessClaims);
    await registerSession(tokens.accessToken);
    return withSessionCookie(redirectToHome("event=connected"), session.sessionId);
  } catch {
    return redirectToHome("event=handshake-failed");
  }
}

async function persistSession(tokens: TokenBundle, claims: AccessTokenClaims) {
  const refreshToken = requiredRefreshToken(tokens.refreshToken);
  const profile = await fetchProfile(tokens.accessToken);

  return createSession({
    sid: claims.sid,
    subject: claims.sub,
    clientId: claims.clientId,
    email: claims.email,
    displayName: profile.display_name,
    accessToken: tokens.accessToken,
    refreshToken,
    idToken: tokens.idToken,
    expiresAt: claims.exp,
    profile: {
      email: profile.email,
      display_name: profile.display_name,
      risk_score: profile.login_context.risk_score,
      mfa_required: profile.login_context.mfa_required,
    },
  });
}

function requiredRefreshToken(token: string | null): string {
  if (token !== null) return token;

  throw new Error("Broker did not issue refresh token.");
}

function assertMatchingSubject(accessSub: string, idSub: string): void {
  if (!sameValue(accessSub, idSub)) {
    throw new Error("Token subject mismatch.");
  }
}

function sameValue(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) return false;

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function redirectToHome(query: string): NextResponse {
  const location = new URL(`/?${query}`, getServerConfig().baseUrl);

  return NextResponse.redirect(location);
}

function withSessionCookie(response: NextResponse, sessionId: string): NextResponse {
  response.cookies.set(
    getServerConfig().sessionCookieName,
    sessionId,
    hostSessionCookieOptions(),
  );

  return response;
}
