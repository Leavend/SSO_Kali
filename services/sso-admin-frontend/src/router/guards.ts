import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router'
import { getAdminEnvironment } from '@/config/adminEnvironment'
import { hasAdminRole } from '@/lib/auth/adminAccess'
import { useSessionStore } from '@/stores/session.store'

export async function resolveAdminGuard(
  to: RouteLocationNormalized,
): Promise<RouteLocationRaw | boolean> {
  if (!to.meta.requiresAdmin) return true

  const session = useSessionStore()
  const sessionResult = await session.ensureSession()

  if (sessionResult === 'unauthenticated') {
    window.location.assign(buildLoginUrl(to.fullPath))
    return false
  }

  if (sessionResult === 'forbidden') return { name: 'admin.forbidden' }
  if (sessionResult === 'mfa_enrollment_required') return { name: 'admin.mfa-required' }
  if (sessionResult === 'step_up_required') return { name: 'admin.step-up-required' }
  if (sessionResult === 'api_unreachable') return { name: 'admin.api-unreachable' }
  if (sessionResult === 'error') return { name: 'admin.error' }

  if (!hasAdminRole(session.roles)) return { name: 'admin.forbidden' }

  const requiredPermissions = routePermissions(to)
  if (requiredPermissions.length === 0) return true

  if (!session.hasEveryPermission(requiredPermissions)) {
    return { name: 'admin.forbidden' }
  }

  return true
}

function routePermissions(to: RouteLocationNormalized): readonly string[] {
  const permissions = to.meta.permissions
  if (!Array.isArray(permissions)) return []

  return permissions.filter((permission): permission is string => typeof permission === 'string')
}

function buildLoginUrl(fullPath: string): string {
  const publicBase = normalizeBasePath(getAdminEnvironment().publicBasePath)
  const returnPath = `${publicBase}${fullPath.replace(/^\//u, '')}`
  const url = new URL('/auth/login', window.location.origin)
  url.searchParams.set('return_to', returnPath)
  return url.toString()
}

function normalizeBasePath(path: string): string {
  const prefixed = path.startsWith('/') ? path : `/${path}`
  return prefixed.endsWith('/') ? prefixed : `${prefixed}/`
}
