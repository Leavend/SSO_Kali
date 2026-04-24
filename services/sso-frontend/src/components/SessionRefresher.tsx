"use client";

import { useEffect, useRef } from "react";

/**
 * Invisible client component that silently refreshes the admin session
 * before the access token expires. Mounted once in the dashboard layout.
 *
 * Checks every 5 minutes. If the session will expire within 10 minutes,
 * calls POST /auth/refresh to get new tokens.
 */
export default function SessionRefresher({ expiresAt }: { readonly expiresAt: number }) {
  const refreshing = useRef(false);

  useEffect(() => {
    async function checkAndRefresh() {
      if (refreshing.current) return;

      const now = Math.floor(Date.now() / 1000);
      const remaining = expiresAt - now;

      // Refresh when less than 10 minutes remaining
      if (remaining > 600) return;

      refreshing.current = true;

      try {
        const res = await fetch("/auth/refresh", { method: "POST" });

        if (res.ok) {
          // Session cookie updated server-side. Reload to pick up new session.
          // Soft reload — no visible flash since we're on the same page.
          window.location.reload();
        } else if (res.status === 401) {
          // Refresh token expired or revoked — redirect to login
          window.location.href = "/";
        }
      } catch {
        // Network error — will retry on next interval
      } finally {
        refreshing.current = false;
      }
    }

    // Run immediately on mount + every 5 minutes
    checkAndRefresh();
    const interval = setInterval(checkAndRefresh, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  return null;
}
