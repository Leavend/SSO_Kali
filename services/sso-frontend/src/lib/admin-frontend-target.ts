const DEFAULT_ADMIN_FRONTEND_BASE_PATH = '/__vue-preview'

export function isAdminFrontendTarget(target: string): boolean {
  return adminFrontendBasePaths().some((basePath) => matchesBasePath(target, basePath))
}

function adminFrontendBasePaths(): readonly string[] {
  return uniquePaths([
    import.meta.env.VITE_ADMIN_FRONTEND_BASE_PATH,
    import.meta.env.VITE_PUBLIC_ADMIN_FRONTEND_BASE_PATH,
    DEFAULT_ADMIN_FRONTEND_BASE_PATH,
  ])
}

function uniquePaths(paths: readonly (string | undefined)[]): readonly string[] {
  return [...new Set(paths.map(normalizeBasePath).filter((path) => path !== null))]
}

function normalizeBasePath(path: string | undefined): string | null {
  if (!path || path.trim() === '') return null
  const prefixed = path.startsWith('/') ? path : `/${path}`
  return prefixed === '/' ? null : prefixed.replace(/\/+$/u, '')
}

function matchesBasePath(target: string, basePath: string): boolean {
  return target === basePath || target.startsWith(`${basePath}/`)
}
