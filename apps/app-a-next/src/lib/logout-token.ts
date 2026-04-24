import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { getServerConfig } from "@/lib/app-config";
import { rememberLogoutTokenJti } from "@/lib/logout-replay-store";

const eventName = "http://schemas.openid.net/event/backchannel-logout";
const jwks = createRemoteJWKSet(new URL(getServerConfig().jwksUrl));

export type LogoutTokenClaims = {
  readonly jti: string;
  readonly sid: string;
  readonly sub: string | null;
};

export async function verifyLogoutToken(token: string): Promise<LogoutTokenClaims> {
  const config = getServerConfig();
  const result = await jwtVerify(token, jwks, {
    issuer: config.issuer,
    audience: config.clientId,
    algorithms: [...config.jwtAllowedAlgorithms],
    clockTolerance: config.jwtClockSkewSeconds,
  });
  const payload = result.payload;
  const sid = readSid(payload);
  const sub = readSub(payload);
  const jti = readJti(payload);
  const exp = readExp(payload);

  assertIssuedAt(payload, config.jwtClockSkewSeconds);
  assertSubjectOrSession(sub, sid);
  assertNoNonce(payload);

  if (!hasLogoutEvent(payload) || jti === null) {
    throw new Error("Invalid logout token.");
  }

  await rememberLogoutTokenJti(jti, exp);

  return {
    jti,
    sid: sid ?? "",
    sub,
  };
}

function hasLogoutEvent(payload: JWTPayload): boolean {
  const events = payload.events;

  return typeof events === "object" && events !== null && eventName in events;
}

function readSid(payload: JWTPayload): string | null {
  return typeof payload.sid === "string" && payload.sid !== "" ? payload.sid : null;
}

function readSub(payload: JWTPayload): string | null {
  return typeof payload.sub === "string" && payload.sub !== "" ? payload.sub : null;
}

function readJti(payload: JWTPayload): string | null {
  return typeof payload.jti === "string" && payload.jti !== "" ? payload.jti : null;
}

function readExp(payload: JWTPayload): number {
  const exp = payload.exp;

  if (typeof exp !== "number") {
    throw new Error("Invalid logout token.");
  }

  return exp;
}

function assertIssuedAt(payload: JWTPayload, clockSkewSeconds: number): void {
  if (typeof payload.iat !== "number" || payload.iat > unixTime() + clockSkewSeconds) {
    throw new Error("Invalid logout token.");
  }
}

function assertSubjectOrSession(sub: string | null, sid: string | null): void {
  if (sub === null && sid === null) {
    throw new Error("Invalid logout token.");
  }
}

function assertNoNonce(payload: JWTPayload): void {
  if ("nonce" in payload) {
    throw new Error("Invalid logout token.");
  }
}

function unixTime(): number {
  return Math.floor(Date.now() / 1000);
}
