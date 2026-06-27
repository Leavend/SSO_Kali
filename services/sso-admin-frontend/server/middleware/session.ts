import { defineEventHandler } from 'h3'
import type { H3Event } from 'h3'
import { appendEventCookie } from '../utils/cookies'
import { publicSession } from '../utils/session'
import { resolveSsoSession } from '../utils/sso-session-resolver'

/**
 * Resolve the encrypted BFF session and attach it to the request context.
 *
 * - `event.context.session` holds the FULL session incl. access/refresh/id
 *   tokens and the widget `sid` — server-only; NEVER written to useState, the
 *   SSR payload, or any client-visible surface.
 * - `event.context.principalState` is the ONLY session-derived value allowed
 *   to hydrate the client: the token-free `publicSession` view (safe principal
 *   fields only). Phase 2 reads this to seed the session store.
 *
 * Any cookies returned by the resolver (refresh re-mint) are forwarded to the
 * response so the browser session cookie stays current.
 */
export async function attachSessionContext(event: H3Event): Promise<void> {
  const resolved = await resolveSsoSession(event.node.req)
  event.context.session = resolved?.session ?? null
  event.context.principalState = resolved?.session ? publicSession(resolved.session) : null
  if (resolved) {
    for (const cookie of resolved.cookies) {
      appendEventCookie(event, cookie)
    }
  }
}

export default defineEventHandler(async (event) => {
  await attachSessionContext(event)
})
