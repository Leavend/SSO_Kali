import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/cookie-policy";

/**
 * Edge Proxy — early-bail redirect for unauthenticated visitors.
 *
 * This is NOT a security boundary (the real auth check is in requireAdminSession).
 * It prevents protected routes from streaming admin-shell loading UI to
 * unauthenticated users before the server-side redirect logic resolves.
 */

const PROTECTED_PREFIXES = ["/dashboard", "/sessions", "/users", "/apps"];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function proxy(request: NextRequest) {
  if (!isProtectedPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const hasSession = request.cookies.has(ADMIN_SESSION_COOKIE);

  if (!hasSession) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/sessions/:path*",
    "/users/:path*",
    "/apps/:path*",
  ],
};
