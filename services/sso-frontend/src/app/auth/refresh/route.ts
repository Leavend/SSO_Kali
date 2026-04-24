import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { getSession, setSession } from "@/lib/session";

/**
 * Silent token refresh using the stored refresh_token.
 *
 * Called by the client-side SessionRefresher component before the
 * access token expires. Returns new tokens and updates the encrypted
 * session cookie so the user never has to re-login.
 */
export async function POST(): Promise<NextResponse> {
  const session = await getSession();

  if (!session?.refreshToken) {
    return NextResponse.json(
      { error: "no_session", message: "No active session or refresh token." },
      { status: 401 },
    );
  }

  try {
    const tokens = await refreshTokens(session.refreshToken);

    const refreshedSession = {
      ...session,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? session.refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
    };

    await setSession(refreshedSession);

    return NextResponse.json({
      status: "refreshed",
      expiresAt: refreshedSession.expiresAt,
    });
  } catch (error) {
    console.error("Token refresh failed:", error instanceof Error ? error.message : error);

    return NextResponse.json(
      { error: "refresh_failed", message: "Token refresh failed." },
      { status: 401 },
    );
  }
}

type RefreshResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

async function refreshTokens(refreshToken: string): Promise<RefreshResponse> {
  const config = getConfig();
  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.clientId,
      refresh_token: refreshToken,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Refresh failed: HTTP ${res.status} — ${body}`);
  }

  return res.json() as Promise<RefreshResponse>;
}
