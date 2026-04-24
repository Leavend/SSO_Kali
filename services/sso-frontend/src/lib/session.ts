import { cookies } from "next/headers";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_TX_COOKIE,
  assertSecureCookieName,
  expiredHostCookieOptions,
  hostCookieOptions,
} from "@/lib/cookie-policy";
import { encryptSession, decryptSession } from "@/lib/session-crypto";
import type { AdminPrincipal, AdminPermissions } from "@/lib/admin-principal";

const SESSION_COOKIE = assertSecureCookieName(ADMIN_SESSION_COOKIE);
const TX_COOKIE = assertSecureCookieName(ADMIN_TX_COOKIE);

export type AdminSession = {
  readonly accessToken: string;
  readonly idToken: string;
  readonly refreshToken: string;
  readonly sub: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: string;
  readonly expiresAt: number;
  readonly authTime: number | null;
  readonly amr: readonly string[];
  readonly acr: string | null;
  readonly lastLoginAt: string | null;
  readonly permissions: AdminPermissions;
};

export type AuthTransaction = {
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
  readonly returnTo?: string;
};

export async function getSession(): Promise<AdminSession | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  try {
    const decrypted = decryptSession(raw);
    if (!decrypted) return null;
    const session = JSON.parse(decrypted) as AdminSession;

    if (isSessionExpired(session.expiresAt)) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function isSessionExpired(expiresAt: number): boolean {
  const bufferSeconds = 30;
  return expiresAt < Math.floor(Date.now() / 1000) + bufferSeconds;
}

export async function setSession(session: AdminSession): Promise<void> {
  const jar = await cookies();
  const encrypted = encryptSession(JSON.stringify(session));
  jar.set(SESSION_COOKIE, encrypted, hostCookieOptions(3600));
}

export function sessionFromBootstrap(
  tokens: {
    readonly accessToken: string;
    readonly idToken: string;
    readonly refreshToken: string;
    readonly expiresAt: number;
  },
  principal: AdminPrincipal,
): AdminSession {
  return {
    accessToken: tokens.accessToken,
    idToken: tokens.idToken,
    refreshToken: tokens.refreshToken,
    sub: principal.subject_id,
    email: principal.email,
    displayName: principal.display_name,
    role: principal.role,
    expiresAt: tokens.expiresAt,
    authTime: principal.auth_context.auth_time,
    amr: [...principal.auth_context.amr],
    acr: principal.auth_context.acr,
    lastLoginAt: principal.last_login_at,
    permissions: principal.permissions,
  };
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", expiredHostCookieOptions());
}

export async function setTransaction(tx: AuthTransaction): Promise<void> {
  const jar = await cookies();
  const encrypted = encryptSession(JSON.stringify(tx));
  jar.set(TX_COOKIE, encrypted, hostCookieOptions(300));
}

export async function pullTransaction(): Promise<AuthTransaction | null> {
  const jar = await cookies();
  const raw = jar.get(TX_COOKIE)?.value;
  if (!raw) return null;
  jar.set(TX_COOKIE, "", expiredHostCookieOptions());
  try {
    const decrypted = decryptSession(raw);
    if (!decrypted) return null;

    return JSON.parse(decrypted) as AuthTransaction;
  } catch {
    return null;
  }
}
