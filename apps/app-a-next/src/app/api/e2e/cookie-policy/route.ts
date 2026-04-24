import { NextResponse } from "next/server";
import { getServerConfig } from "@/lib/app-config";
import {
  expiredHostSessionCookieOptions,
  hostSessionCookieOptions,
} from "@/lib/cookie-policy";

export async function GET(): Promise<NextResponse> {
  if (process.env.ENABLE_E2E_COOKIE_PROBE !== "1") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const response = NextResponse.json({ ok: true });

  response.cookies.set(
    getServerConfig().sessionCookieName,
    "probe-session",
    hostSessionCookieOptions(),
  );

  return response;
}

export async function DELETE(): Promise<NextResponse> {
  if (process.env.ENABLE_E2E_COOKIE_PROBE !== "1") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const response = NextResponse.json({ ok: true });

  response.cookies.set(
    getServerConfig().sessionCookieName,
    "",
    expiredHostSessionCookieOptions(),
  );

  return response;
}
