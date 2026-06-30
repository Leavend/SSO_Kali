import { defineEventHandler } from 'h3'
import type { H3Event } from 'h3'
import type { IncomingMessage } from 'node:http'
import { publicSession, resolveAdminSession } from '../utils/session'

/**
 * Read-only, fail-closed principal projection for SSR.
 *
 * This middleware runs on every page/SSR request. It performs ONLY a read of
 * the encrypted BFF session (decrypt + store read + expiry check) — it NEVER
 * refreshes tokens, registers the RP session, writes to the session store, or
 * mints cookies. Those side effects stay where a FRESH token is actually used:
 * the admin proxy (`admin-proxy.ts` -> `resolveSsoSession`), which injects the
 * Bearer and degrades to a 401 + cookie-clear on failure.
 *
 * Keeping the middleware read-only avoids two cross-cutting hazards:
 *  - It no longer races the IdP's rotating refresh token across the SSR
 *    `useAsyncData` fan-out (one page render + N internal `/api/admin/*`
 *    fetches), where a failed concurrent refresh could clear a just-rotated
 *    session.
 *  - A Redis outage or refresh failure on a cookie-carrying request can no
 *    longer 500 the whole page render; it degrades to an unauthenticated
 *    context instead.
 *
 * Custody:
 * - `event.context.session` holds the FULL session incl. access/refresh/id
 *   tokens and the widget `sid` — server-only; NEVER written to useState, the
 *   SSR payload, or any client-visible surface.
 * - `event.context.principalState` is the ONLY session-derived value allowed
 *   to hydrate the client: the token-free `publicSession` view (safe principal
 *   fields only). Phase 2 reads this to seed the session store.
 */
export async function attachSessionContext(event: H3Event): Promise<void> {
  try {
    const session = await resolveAdminSession(event.node.req as IncomingMessage)
    event.context.session = session
    event.context.principalState = session ? publicSession(session) : null
  } catch {
    // Fail closed but graceful: a decrypt error, store read failure, or any
    // other fault leaves the request unauthenticated rather than 500-ing the
    // page render. Mirrors the admin proxy's fail-closed-graceful contract.
    event.context.session = null
    event.context.principalState = null
  }
}

/**
 * Page/SSR routes are the only ones that need the token-free principal
 * projection for hydration. API routes resolve (and refresh) their own session
 * in the admin proxy, and auth/widget/asset routes never read the principal —
 * so skip the read-only resolve for them.
 */
function requiresPrincipalProjection(event: H3Event): boolean {
  const pathname = (event.path ?? '/').split('?')[0] ?? '/'
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/widget/') ||
    pathname.startsWith('/_nuxt/')
  ) {
    return false
  }

  // Static assets (anything with a file extension) never need a principal.
  return !/\.[a-z0-9]+$/iu.test(pathname)
}

export default defineEventHandler(async (event) => {
  if (!requiresPrincipalProjection(event)) return
  await attachSessionContext(event)
})
