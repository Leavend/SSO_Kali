"use client";

import { useEffect } from "react";

/**
 * Lightweight client-side page that triggers a full-page navigation to /auth/login.
 *
 * WHY THIS EXISTS:
 * When a server component calls `redirect("/auth/login")` during an RSC navigation
 * (e.g., clicking a sidebar tab), Next.js follows the redirect using `fetch()`.
 * Since /auth/login is a Route Handler that redirects to an external IdP (ZITADEL),
 * the fetch crosses origins and gets blocked by CORS.
 *
 * By redirecting to this CLIENT page first, we break the RSC fetch chain.
 * This page renders in the browser and then does `window.location.replace()`
 * which is a full-page navigation — no fetch, no CORS.
 */
export default function AuthRedirectPage() {
  useEffect(() => {
    // Full-page navigation to start the PKCE login flow
    window.location.replace("/auth/login");
  }, []);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        fontFamily: "system-ui, sans-serif",
        color: "#6b7280",
        fontSize: "14px",
      }}
    >
      <p>Redirecting to login…</p>
    </div>
  );
}
