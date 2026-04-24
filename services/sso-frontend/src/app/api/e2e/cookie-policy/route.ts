import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_TX_COOKIE,
  expiredHostCookieOptions,
  hostCookieOptions,
} from "@/lib/cookie-policy";

export async function GET(): Promise<NextResponse> {
  if (process.env.ENABLE_E2E_COOKIE_PROBE !== "1") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const response = NextResponse.json({ ok: true });

  response.cookies.set(ADMIN_SESSION_COOKIE, "probe-session", hostCookieOptions(3600));
  response.cookies.set(ADMIN_TX_COOKIE, "probe-tx", hostCookieOptions(300));

  return response;
}

export async function DELETE(): Promise<NextResponse> {
  if (process.env.ENABLE_E2E_COOKIE_PROBE !== "1") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const response = NextResponse.json({ ok: true });

  response.cookies.set(ADMIN_SESSION_COOKIE, "", expiredHostCookieOptions());
  response.cookies.set(ADMIN_TX_COOKIE, "", expiredHostCookieOptions());

  return response;
}
