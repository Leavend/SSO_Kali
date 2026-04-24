import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const DEFAULT_IDENTITY_UI_PATH = "/ui/v2/login/";

export function redirectToIdentityUi(request: NextRequest, relativePath: string): NextResponse {
  const target = identityUiUrl(request, relativePath);
  const loginHint = request.nextUrl.searchParams.get("login_hint");

  if (loginHint) {
    target.searchParams.set("login_hint", loginHint);
  }

  const response = NextResponse.redirect(target);
  response.headers.set("cache-control", "no-store, no-cache, private, max-age=0");
  response.headers.set("x-content-type-options", "nosniff");

  return response;
}

function identityUiUrl(request: NextRequest, relativePath: string): URL {
  const configuredBase = process.env.SSO_IDENTITY_UI_BASE_URL?.trim();
  const base = configuredBase
    ? ensureTrailingSlash(configuredBase)
    : new URL(DEFAULT_IDENTITY_UI_PATH, process.env.NEXT_PUBLIC_SSO_BASE_URL ?? request.nextUrl.origin).toString();

  return new URL(relativePath, base);
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
