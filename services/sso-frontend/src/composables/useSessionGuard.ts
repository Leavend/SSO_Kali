/**
 * useSessionGuard — global 401 interceptor for session expiry (ISSUE-03).
 *
 * Composable yang dipasang di App.vue / PortalLayout. Mendeteksi ApiError 401
 * dari API calls dan redirect ke login dengan pesan "sesi kedaluwarsa".
 *
 * FR-039 / UC-49: graceful session expiry UX.
 */

import { watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session.store'
import { isUnauthorized } from '@/lib/api/api-error'

/**
 * Install a global error handler that intercepts 401 responses
 * and redirects to login. Call once in the portal layout.
 */
export function useSessionGuard(): void {
  const router = useRouter()
  const session = useSessionStore()

  // Watch for session becoming unauthenticated after being authenticated
  watch(
    () => session.status,
    (newStatus, oldStatus) => {
      if (oldStatus === 'ready' && newStatus === 'idle') {
        void router.replace({
          name: 'auth.login',
          query: { redirect: router.currentRoute.value.fullPath, expired: '1' },
        })
      }
    },
  )
}

/**
 * Handle API errors — if 401, clear session and let the router guard redirect.
 * Use this in composables/stores that call profile/session APIs.
 */
export function handleSessionExpiry(error: unknown): boolean {
  if (isUnauthorized(error)) {
    const session = useSessionStore()
    session.clear()
    return true
  }
  return false
}
