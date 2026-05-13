/**
 * handleSessionExpiry — lightweight 401 handler for stores/composables.
 *
 * Separated from useSessionGuard to avoid pulling vue-router into
 * the profile store's critical chunk (LCP optimization).
 */

import { isUnauthorized } from '@/lib/api/api-error'
import { useSessionStore } from '@/stores/session.store'

/**
 * Handle API errors — if 401, clear session state.
 * The router guard in beforeEach will redirect on next navigation.
 * The heartbeat in PortalLayout will redirect within 60s.
 */
export function handleSessionExpiry(error: unknown): boolean {
  if (isUnauthorized(error)) {
    const session = useSessionStore()
    session.clear()
    return true
  }
  return false
}
