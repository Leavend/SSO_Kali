import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, expiredHostCookieOptions, hostCookieOptions } from "@/lib/cookie-policy";
import { encryptSession } from "@/lib/session-crypto";
import type { AdminPrincipal } from "@/lib/admin-principal";
import type { AdminSession } from "@/lib/session";

export type AdminE2EScenario = "fresh-admin" | "step-up-stale-admin" | "non-admin";

export function e2eEnabled(): boolean {
  return process.env.ENABLE_E2E_ADMIN_FLOW_PROBE === "1";
}

export function e2eNotFound(): NextResponse {
  return new NextResponse("Not Found", { status: 404 });
}

export function scenarioFromRequest(value: unknown): AdminE2EScenario | null {
  return value === "fresh-admin" || value === "step-up-stale-admin" || value === "non-admin"
    ? value
    : null;
}

export function sessionCookieResponse(scenario: AdminE2EScenario): NextResponse {
  const response = NextResponse.json({ ok: true, scenario });

  response.cookies.set(
    ADMIN_SESSION_COOKIE,
    encodeSessionCookie(mockSession(scenario)),
    hostCookieOptions(3600),
  );

  return response;
}

export function clearSessionCookieResponse(): NextResponse {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, "", expiredHostCookieOptions());

  return response;
}

export function mockPrincipalForToken(token: string): AdminPrincipal | null {
  return principalByToken()[token] ?? null;
}

export function isForbiddenToken(token: string): boolean {
  return token === "e2e-non-admin-token";
}

export function mockSessions() {
  return [
    {
      session_id: "sess-e2e-1",
      client_id: "prototype-app-a",
      subject_id: "admin-e2e-1",
      email: "admin@example.com",
      display_name: "Admin Example",
      scope: "openid profile email",
      created_at: "2026-04-05T10:00:00Z",
      expires_at: "2026-04-05T11:00:00Z",
    },
  ];
}

export function readBearerToken(header: string | null): string {
  if (!header?.startsWith("Bearer ")) {
    return "";
  }

  return header.slice("Bearer ".length);
}

type PrincipalLookup = Record<string, AdminPrincipal>;

function principalByToken(): PrincipalLookup {
  return {
    "e2e-fresh-admin-token": createPrincipal("admin", 2),
    "e2e-step-up-stale-admin-token": createPrincipal("admin", 10),
  };
}

function mockSession(scenario: AdminE2EScenario): AdminSession {
  const base = baseSession();

  if (scenario === "fresh-admin") {
    return {
      ...base,
      accessToken: "e2e-fresh-admin-token",
      authTime: secondsAgo(2),
    };
  }

  if (scenario === "step-up-stale-admin") {
    return {
      ...base,
      accessToken: "e2e-step-up-stale-admin-token",
      authTime: secondsAgo(10),
    };
  }

  return {
    ...base,
    accessToken: "e2e-non-admin-token",
    role: "viewer",
    permissions: {
      view_admin_panel: false,
      manage_sessions: false,
    },
  };
}

function baseSession(): AdminSession {
  return {
    accessToken: "e2e-token",
    idToken: "e2e-id-token",
    refreshToken: "e2e-refresh-token",
    sub: "admin-e2e-1",
    email: "admin@example.com",
    displayName: "Admin Example",
    role: "admin",
    expiresAt: secondsAgo(-60),
    authTime: secondsAgo(2),
    amr: ["pwd", "mfa"],
    acr: "urn:example:loa:2",
    lastLoginAt: "2026-04-05T12:00:00Z",
    permissions: {
      view_admin_panel: true,
      manage_sessions: true,
    },
  };
}

function createPrincipal(role: string, authMinutesAgo: number): AdminPrincipal {
  return {
    subject_id: "admin-e2e-1",
    email: "admin@example.com",
    display_name: "Admin Example",
    role,
    last_login_at: "2026-04-05T12:00:00Z",
    auth_context: {
      auth_time: secondsAgo(authMinutesAgo),
      amr: ["pwd", "mfa"],
      acr: "urn:example:loa:2",
    },
    permissions: {
      view_admin_panel: role === "admin",
      manage_sessions: role === "admin",
    },
  };
}

function secondsAgo(minutesAgo: number): number {
  return Math.floor(Date.now() / 1000) - (minutesAgo * 60);
}

function encodeSessionCookie(session: AdminSession): string {
  return encryptSession(JSON.stringify(session));
}
