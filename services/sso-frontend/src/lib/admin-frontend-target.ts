const DEFAULT_ADMIN_FRONTEND_BASE_PATH = '/__vue-preview'
const ADMIN_FRONTEND_ROOT_PATHS = new Set(['/oidc-foundation', '/forbidden', '/admin-error'])
const ADMIN_FRONTEND_ROOT_PREFIXES = ['/oidc-foundation/']

export function isAdminFrontendTarget(target: string): boolean {
  return (
    adminFrontendBasePaths().some((basePath) => matchesBasePath(target, basePath)) ||
    isAdminFrontendOriginTarget(target)
  )
}

export function adminFrontendUrlForTarget(target: string, currentOrigin: string): string {
  const adminOrigin = adminFrontendOrigin()

  if (adminOrigin && isAdminRootPathTarget(target)) {
    return new URL(target, adminOrigin).toString()
  }

  return new URL(target, currentOrigin).toString()
}

function adminFrontendBasePaths(): readonly string[] {
  return uniquePaths([
    import.meta.env.VITE_ADMIN_FRONTEND_BASE_PATH,
    import.meta.env.VITE_PUBLIC_ADMIN_FRONTEND_BASE_PATH,
    DEFAULT_ADMIN_FRONTEND_BASE_PATH,
  ])
}

function isAdminFrontendOriginTarget(target: string): boolean {
  const adminOrigin = adminFrontendOrigin()
  return adminOrigin !== null && isAdminRootPathTarget(target)
}

function adminFrontendOrigin(): string | null {
  return normalizeOrigin(import.meta.env.VITE_ADMIN_FRONTEND_ORIGIN)
}

function uniquePaths(paths: readonly (string | undefined)[]): readonly string[] {
  return [...new Set(paths.map(normalizeBasePath).filter((path) => path !== null))]
}

function normalizeBasePath(path: string | undefined): string | null {
  if (!path || path.trim() === '') return null
  const prefixed = path.startsWith('/') ? path : `/${path}`
  return prefixed === '/' ? null : prefixed.replace(/\/+$/u, '')
}

function normalizeOrigin(origin: string | undefined): string | null {
  if (!origin || origin.trim() === '') return null

  try {
    const url = new URL(origin)
    return url.origin
  } catch {
    return null
  }
}

function matchesBasePath(target: string, basePath: string): boolean {
  return target === basePath || target.startsWith(`${basePath}/`)
}

function isAdminRootPathTarget(target: string): boolean {
  return (
    isSafePathTarget(target) &&
    (ADMIN_FRONTEND_ROOT_PATHS.has(target) ||
      ADMIN_FRONTEND_ROOT_PREFIXES.some((prefix) => target.startsWith(prefix)))
  )
}

function isSafePathTarget(target: string): boolean {
  return target.startsWith('/') && !target.startsWith('//')
}
