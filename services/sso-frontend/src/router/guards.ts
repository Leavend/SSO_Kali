import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router'
import { useSessionStore } from '@/stores/session.store'

export async function resolveAuthGuard(
  to: RouteLocationNormalized,
): Promise<RouteLocationRaw | boolean> {
  const session = useSessionStore()

  if (to.meta.requiresAuth) {
    const ok = session.isAuthenticated || (await session.ensureSession())
    if (!ok) return { name: 'auth.login', query: { redirect: to.fullPath } }
  }

  if (to.meta.requiresGuest) {
    const promptParam = to.query.prompt as string | undefined
    if (promptParam === 'login') return true

    const ok = session.isAuthenticated || (await session.ensureSession())
    if (ok) return { name: 'portal.home' }
  }

  return true
}
