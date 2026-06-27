import { defineEventHandler } from 'h3'
import type { H3Event } from 'h3'
import { appendEventCookie } from '../utils/cookies'
import { resolveSsoSession } from '../utils/sso-session-resolver'

/**
 * Resolve the encrypted BFF session and attach it to the request context.
 *
 * Tokens live ONLY in `event.context.session` (server-only). This object is
 * never serialised into the SSR payload, written to useState, or forwarded to
 * any client-visible surface. Phase 2 hydration must consume the token-free
 * projection (`publicSession(event.context.session)`) instead.
 *
 * Any cookies returned by the resolver (refresh re-mint) are forwarded to the
 * response so the browser session cookie stays current.
 */
export async function attachSessionContext(event: H3Event): Promise<void> {
  const resolved = await resolveSsoSession(event.node.req)
  event.context.session = resolved?.session ?? null
  if (resolved) {
    for (const cookie of resolved.cookies) {
      appendEventCookie(event, cookie)
    }
  }
}

export default defineEventHandler(async (event) => {
  await attachSessionContext(event)
})
