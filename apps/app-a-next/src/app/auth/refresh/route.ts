import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerConfig } from "@/lib/app-config";
import { expiredHostSessionCookieOptions } from "@/lib/cookie-policy";
import { verifyAccessToken, type AccessTokenClaims } from "@/lib/jwt";
import { refreshTokens } from "@/lib/oidc";
import {
  destroySession,
  findSession,
  releaseRefreshLock,
  replaceSessionTokens,
  tryAcquireRefreshLock,
  waitForSessionRefresh,
  type AppSession,
} from "@/lib/session-store";

const refreshSkewSeconds = 90;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const sessionId = request.cookies.get(getServerConfig().sessionCookieName)?.value;

  if (sessionId === undefined) return unauthorized();

  const session = await findSession(sessionId);
  if (session === null) return unauthorized();
  if (accessTokenFresh(session)) return refreshed(session);

  return refreshWithLock(sessionId, session);
}

async function refreshWithLock(sessionId: string, session: AppSession): Promise<NextResponse> {
  const acquired = await tryAcquireRefreshLock(sessionId);

  if (!acquired) return waitForPeerRefresh(sessionId, session.lastRefreshedAt);

  try {
    return await rotateSession(sessionId);
  } catch {
    return unauthorized(sessionId);
  } finally {
    await releaseRefreshLock(sessionId);
  }
}

async function waitForPeerRefresh(
  sessionId: string,
  previousRefreshedAt: number,
): Promise<NextResponse> {
  const session = await waitForSessionRefresh(sessionId, previousRefreshedAt);

  return session === null ? unauthorized(sessionId) : refreshed(session);
}

async function rotateSession(sessionId: string): Promise<NextResponse> {
  const currentSession = await findSession(sessionId);

  if (currentSession === null) return unauthorized(sessionId);
  if (accessTokenFresh(currentSession)) return refreshed(currentSession);
  if (currentSession.refreshToken === null) return unauthorized(sessionId);

  return persistRotatedTokens(sessionId, currentSession);
}

async function persistRotatedTokens(
  sessionId: string,
  session: AppSession,
): Promise<NextResponse> {
  const tokens = await refreshTokens(requiredExistingRefreshToken(session.refreshToken));
  const claims = await verifyAccessToken(tokens.accessToken);

  assertSameSession(claims, session);
  const nextSession = await replaceSessionTokens(sessionId, {
    accessToken: tokens.accessToken,
    expiresAt: claims.exp,
    idToken: tokens.idToken,
    refreshToken: requiredRefreshToken(tokens.refreshToken),
  });

  return nextSession === null ? unauthorized(sessionId) : refreshed(nextSession);
}

function accessTokenFresh(session: AppSession): boolean {
  return session.expiresAt - unixTime() > refreshSkewSeconds;
}

function assertSameSession(claims: AccessTokenClaims, session: AppSession): void {
  if (!sameValue(claims.sid, session.sid) || !sameValue(claims.sub, session.subject)) {
    throw new Error("Refreshed token does not match the existing session.");
  }
}

function requiredRefreshToken(token: string | null): string {
  if (token !== null) return token;

  throw new Error("Broker did not rotate refresh token.");
}

function requiredExistingRefreshToken(token: string | null): string {
  if (token !== null) return token;

  throw new Error("Session does not hold a refresh token.");
}

function refreshed(session: AppSession): NextResponse {
  return NextResponse.json(
    { expiresAt: session.expiresAt, status: "refreshed" },
    { headers: noStoreHeaders() },
  );
}

async function unauthorized(sessionId?: string): Promise<NextResponse> {
  if (sessionId !== undefined) await destroySession(sessionId);

  const response = NextResponse.json(
    { error: "session_expired" },
    { headers: noStoreHeaders(), status: 401 },
  );
  response.cookies.set(getServerConfig().sessionCookieName, "", expiredHostSessionCookieOptions());

  return response;
}

function sameValue(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function noStoreHeaders(): HeadersInit {
  return { "Cache-Control": "no-store" };
}

function unixTime(): number {
  return Math.floor(Date.now() / 1000);
}
