import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router'
import { useSessionStore } from '@/stores/session.store'

export async function resolveAuthGuard(
  to: RouteLocationNormalized,
): Promise<RouteLocationRaw | boolean> {
  const session = useSessionStore()

  if (to.meta.requiresAuth) {
    const ok = session.isAuthenticated || (await session.ensureSession())
    if (!ok) return frontChannelToIdp(to)
  }

  if (to.meta.requiresGuest) {
    const promptParam = to.query.prompt as string | undefined
    if (promptParam === 'login') return true

    const authRequestId = to.query.auth_request_id
    if (typeof authRequestId === 'string' && authRequestId.length > 0) return true

    const ok = session.isAuthenticated || (await session.ensureSession())
    if (ok) return { name: 'portal.home' }
  }

  return true
}

/**
 * Seamless cross-app SSO entry point.
 *
 * On a protected-route session miss we do NOT drop the visitor on the in-SPA
 * login form. Instead we perform a TOP-LEVEL browser navigation to the portal
 * BFF login endpoint, which front-channels to the real IdP authorize endpoint.
 * That top-level hop carries the IdP's first-party `__Host-laravel_session`
 * (SameSite=Lax), so a user already signed in elsewhere (e.g. the admin
 * console) is silently re-authenticated without any third-party cookie.
 *
 * If the IdP has no session it bounces back to the in-SPA login route WITH an
 * `auth_request_id`, which the `requiresGuest` branch already lets through — so
 * there is no redirect loop and the credential-entry path stays intact.
 *
 * SSR / test environments without `window.location.assign` fall back to the
 * in-SPA login route so nothing breaks server-side.
 */
function frontChannelToIdp(to: RouteLocationNormalized): RouteLocationRaw | boolean {
  if (typeof window === 'undefined' || typeof window.location?.assign !== 'function') {
    return { name: 'auth.login', query: { redirect: to.fullPath } }
  }

  window.location.assign(`/auth/login?return_to=${encodeURIComponent(to.fullPath)}`)
  return false
}
