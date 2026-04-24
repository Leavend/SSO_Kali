import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  generateNonce,
  buildAuthorizeUrl,
} from "@/lib/pkce";
import { recordAdminAuthFunnelEvent } from "@/lib/admin-auth-funnel";
import { normalizeReturnTo } from "@/lib/admin-login-url";
import { setTransaction } from "@/lib/session";

/**
 * Initiates the OIDC/PKCE login flow by redirecting to the ZITADEL authorize endpoint.
 *
 * IMPORTANT: When Next.js App Router does a client-side navigation, it fetches
 * route handlers via RSC (indicated by `_rsc` param or `RSC` header). If we
 * return a standard 302 redirect to ZITADEL, the browser's fetch API follows
 * the redirect → hits CORS because ZITADEL (a different origin) doesn't serve
 * `Access-Control-Allow-Origin`.
 *
 * To prevent this, we detect RSC/fetch requests and return a 200 response with
 * a meta-refresh + JS redirect, forcing a full-page navigation to the IdP.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const state = generateState();
  const nonce = generateNonce();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const returnTo = normalizeReturnTo(request.nextUrl.searchParams.get("return_to"));

  await setTransaction({
    state,
    nonce,
    codeVerifier,
    ...(returnTo ? { returnTo } : {}),
  });

  recordAdminAuthFunnelEvent("admin_login_started");

  const loginHint = request.nextUrl.searchParams.get("login_hint");
  const url = buildAuthorizeUrl({
    state,
    nonce,
    codeChallenge,
    ...(loginHint ? { loginHint } : {}),
  });

  // If this is an RSC fetch (client-side navigation), we cannot do a 302
  // redirect to an external origin — the browser will block it with CORS.
  // Instead, return an HTML page that does a client-side redirect.
  const isRscFetch =
    request.headers.get("rsc") !== null ||
    request.nextUrl.searchParams.has("_rsc") ||
    request.headers.get("next-router-state-tree") !== null;

  if (isRscFetch) {
    // Return a full HTML page that performs the redirect client-side.
    // This breaks out of the RSC fetch cycle and does a proper navigation.
    const html = `<!DOCTYPE html>
<html><head>
<meta http-equiv="refresh" content="0;url=${escapeHtml(url)}">
<script>window.location.replace(${JSON.stringify(url)})</script>
</head><body>Redirecting to login...</body></html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store, no-cache, private, max-age=0",
        "x-content-type-options": "nosniff",
      },
    });
  }

  // Standard browser navigation → use a normal redirect
  return NextResponse.redirect(url);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
