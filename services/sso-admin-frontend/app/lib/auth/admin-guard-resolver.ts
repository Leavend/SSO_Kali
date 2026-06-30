import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router'
import { hasAdminRole } from '@/lib/auth/admin-access'
import { useSessionStore, type SessionEnsureResult } from '@/stores/session.store'

export type BootstrapResolution =
  | { readonly kind: 'login'; readonly url: string }
  | { readonly kind: 'route'; readonly to: RouteLocationRaw }
  | { readonly kind: 'allow' }

export function normalizeBasePath(path: string): string {
  const prefixed = path.startsWith('/') ? path : `/${path}`
  return prefixed.endsWith('/') ? prefixed : `${prefixed}/`
}

export function buildLoginUrl(fullPath: string, origin: string, basePath: string): string {
  const publicBase = normalizeBasePath(basePath)
  const returnPath = `${publicBase}${fullPath.replace(/^\//u, '')}`
  const url = new URL('/auth/login', origin)
  url.searchParams.set('return_to', returnPath)
  return url.toString()
}

export function resolveBootstrapFailure(
  result: SessionEnsureResult | null,
  fullPath: string,
  origin: string,
  basePath: string,
): BootstrapResolution {
  if (result === 'unauthenticated')
    return { kind: 'login', url: buildLoginUrl(fullPath, origin, basePath) }
  if (result === 'forbidden') return { kind: 'route', to: { name: 'admin.forbidden' } }
  if (result === 'mfa_enrollment_required')
    return { kind: 'route', to: { name: 'admin.mfa-required', query: { return_to: fullPath } } }
  if (result === 'step_up_required')
    return { kind: 'route', to: { name: 'admin.step-up-required', query: { return_to: fullPath } } }
  if (result === 'api_unreachable') return { kind: 'route', to: { name: 'admin.api-unreachable' } }
  if (result === 'error') return { kind: 'route', to: { name: 'admin.error' } }
  return { kind: 'allow' }
}

function routePermissions(to: RouteLocationNormalized): readonly string[] {
  const permissions = to.meta.permissions
  if (!Array.isArray(permissions)) return []
  return permissions.filter((p): p is string => typeof p === 'string')
}

export function resolveLoadedAdminAccess(to: RouteLocationNormalized): RouteLocationRaw | true {
  if (!to.meta.requiresAdmin) return true

  const session = useSessionStore()

  if (!session.principal) return true

  if (!hasAdminRole(session.roles)) return { name: 'admin.forbidden' }

  const requiredPermissions = routePermissions(to)
  if (requiredPermissions.length === 0) return true

  if (!session.hasEveryPermission(requiredPermissions)) return { name: 'admin.forbidden' }

  return true
}
