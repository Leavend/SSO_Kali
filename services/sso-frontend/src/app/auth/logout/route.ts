import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { clearSession, getSession } from "@/lib/session";

export async function GET(): Promise<NextResponse> {
  const config = getConfig();

  await revokeBackendTokens(config);
  await clearSession();

  return NextResponse.redirect(new URL("/", config.appBaseUrl));
}

async function revokeBackendTokens(config: ReturnType<typeof getConfig>): Promise<void> {
  const session = await getSession();
  if (!session) return;

  await Promise.allSettled([
    revokeSession(config.internalLogoutUrl, session.accessToken),
    revokeRefreshToken(config, session.refreshToken),
  ]);
}

async function revokeSession(logoutUrl: string, accessToken: string): Promise<void> {
  await fetch(logoutUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(5_000),
  });
}

async function revokeRefreshToken(
  config: ReturnType<typeof getConfig>,
  refreshToken: string,
): Promise<void> {
  const revocationUrl = config.internalRevocationUrl;

  await fetch(revocationUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      token: refreshToken,
      token_type_hint: "refresh_token",
    }),
    signal: AbortSignal.timeout(5_000),
  });
}
