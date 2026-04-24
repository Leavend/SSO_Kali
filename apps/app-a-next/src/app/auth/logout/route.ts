import { NextRequest, NextResponse } from "next/server";
import { getServerConfig } from "@/lib/app-config";
import { expiredHostSessionCookieOptions } from "@/lib/cookie-policy";
import { logoutSession } from "@/lib/oidc";
import { destroySession, findSession } from "@/lib/session-store";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const config = getServerConfig();
  const sessionId = request.cookies.get(config.sessionCookieName)?.value;

  if (sessionId !== undefined) {
    const session = await findSession(sessionId);

    if (session !== null) {
      await performRemoteLogout(session.accessToken);
      await destroySession(sessionId);
    }
  }

  const response = NextResponse.redirect(new URL("/?event=signed-out", request.url));

  response.cookies.set(config.sessionCookieName, "", expiredHostSessionCookieOptions());

  return response;
}

async function performRemoteLogout(accessToken: string): Promise<void> {
  try {
    await logoutSession(accessToken);
  } catch {
  }
}
