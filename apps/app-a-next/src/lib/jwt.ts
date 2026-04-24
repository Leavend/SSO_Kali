import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { getServerConfig } from "@/lib/app-config";

export type AccessTokenClaims = {
  readonly sid: string;
  readonly sub: string;
  readonly clientId: string;
  readonly exp: number;
  readonly email: string | null;
  readonly name: string | null;
};

export type IdTokenClaims = {
  readonly sub: string;
  readonly nonce: string;
  readonly exp: number;
};

type VerifiedPayload = JWTPayload & Record<string, unknown>;

const jwks = createRemoteJWKSet(new URL(getServerConfig().jwksUrl));

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  const payload = await verifyToken(token, getServerConfig().resourceAudience);
  assertTokenUse(payload, "access");

  return {
    sid: readRequiredString(payload.sid, "sid"),
    sub: readRequiredString(payload.sub, "sub"),
    clientId: readRequiredString(payload.client_id, "client_id"),
    exp: readRequiredNumber(payload.exp, "exp"),
    email: readOptionalString(payload.email),
    name: readOptionalString(payload.name),
  };
}

export async function verifyIdToken(token: string): Promise<IdTokenClaims> {
  const payload = await verifyToken(token, getServerConfig().clientId);
  assertTokenUse(payload, "id");

  return {
    sub: readRequiredString(payload.sub, "sub"),
    nonce: readRequiredString(payload.nonce, "nonce"),
    exp: readRequiredNumber(payload.exp, "exp"),
  };
}

async function verifyToken(token: string, audience: string): Promise<VerifiedPayload> {
  const config = getServerConfig();
  const result = await jwtVerify(token, jwks, {
    issuer: config.issuer,
    audience,
    algorithms: [...config.jwtAllowedAlgorithms],
    clockTolerance: config.jwtClockSkewSeconds,
  });
  const payload = result.payload as VerifiedPayload;

  assertExpiry(payload);
  assertIssuedAt(payload, config.jwtClockSkewSeconds);

  return payload;
}

function assertTokenUse(payload: VerifiedPayload, expected: "access" | "id"): void {
  if (payload.token_use !== expected) {
    throw new Error(`Invalid ${expected} token payload.`);
  }
}

function assertExpiry(payload: VerifiedPayload): void {
  readRequiredNumber(payload.exp, "exp");
}

function assertIssuedAt(payload: VerifiedPayload, clockSkewSeconds: number): void {
  const issuedAt = readRequiredNumber(payload.iat, "iat");

  if (issuedAt > unixTime() + clockSkewSeconds) {
    throw new Error("Invalid iat claim.");
  }
}

function readRequiredString(value: unknown, name: string): string {
  if (typeof value === "string" && value !== "") {
    return value;
  }

  throw new Error(`Invalid ${name} claim.`);
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function readRequiredNumber(value: unknown, name: string): number {
  if (typeof value === "number") {
    return value;
  }

  throw new Error(`Invalid ${name} claim.`);
}

function unixTime(): number {
  return Math.floor(Date.now() / 1000);
}
