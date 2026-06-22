export interface ViteManifestEntry {
  readonly file?: string
  readonly imports?: readonly string[]
  readonly isEntry?: boolean
}

export type ViteManifest = Readonly<Record<string, ViteManifestEntry>>

const routeManifestKeys: readonly { readonly path: string; readonly manifestKey: string }[] = [
  {
    path: '/clients/new',
    manifestKey: 'src/features/clients/pages/ClientCreatePage.vue',
  },
  {
    path: '/users/new',
    manifestKey: 'src/features/users/pages/UserCreatePage.vue',
  },
  {
    path: '/dashboard',
    manifestKey: 'src/features/dashboard/pages/DashboardPage.vue',
  },
  {
    path: '/oidc-foundation',
    manifestKey: 'src/features/oidc-foundation/pages/OidcFoundationPage.vue',
  },
  {
    path: '/clients',
    manifestKey: 'src/features/clients/pages/ClientsPage.vue',
  },
  {
    path: '/users',
    manifestKey: 'src/features/users/pages/UsersPage.vue',
  },
  {
    path: '/observability',
    manifestKey: 'src/features/observability/pages/AuditObservabilityPage.vue',
  },
  {
    path: '/observability/compliance',
    manifestKey: 'src/features/audit/pages/AuditPage.vue',
  },
  {
    path: '/sessions',
    manifestKey: 'src/features/sessions/pages/SessionsPage.vue',
  },
  {
    path: '/policy',
    manifestKey: 'src/features/policy/pages/PolicyPage.vue',
  },
  {
    path: '/sso-error-templates',
    manifestKey: 'src/features/sso-error-templates/pages/SsoErrorTemplatesPage.vue',
  },
  {
    path: '/external-idps',
    manifestKey: 'src/features/external-idps/pages/ExternalIdpsPage.vue',
  },
  {
    path: '/ip-access',
    manifestKey: 'src/features/ip-access/pages/IpAccessPage.vue',
  },
  {
    path: '/ops',
    manifestKey: 'src/features/ops/pages/OpsPage.vue',
  },
  {
    path: '/roles',
    manifestKey: 'src/features/roles/pages/RolesPage.vue',
  },
  {
    path: '/authentication-audit',
    manifestKey: 'src/features/authentication-audit/pages/AuthenticationAuditPage.vue',
  },
  {
    path: '/profile',
    manifestKey: 'src/features/profile/pages/AdminProfilePage.vue',
  },
]

export function resolveInitialRouteManifestKey(pathname: string): string | null {
  const normalizedPath = normalizeRoutePath(pathname)
  if (normalizedPath === '/') return 'src/features/dashboard/pages/DashboardPage.vue'

  return routeManifestKeys.find((entry) => entry.path === normalizedPath)?.manifestKey ?? null
}

export function createInitialRoutePreloadLinks(
  pathname: string,
  manifest: ViteManifest | null,
  basePath = '/',
): string {
  if (!manifest) return ''

  const manifestKey = resolveInitialRouteManifestKey(pathname)
  if (!manifestKey) return ''

  const files = collectModuleFiles(manifestKey, manifest)
  return files
    .map((file) => `<link rel="modulepreload" crossorigin href="${assetHref(file, basePath)}">`)
    .join('\n')
}

function collectModuleFiles(manifestKey: string, manifest: ViteManifest): readonly string[] {
  const files: string[] = []
  const seenKeys = new Set<string>()
  const seenFiles = new Set<string>()

  function visit(key: string): void {
    if (seenKeys.has(key)) return
    seenKeys.add(key)

    if (key === 'index.html') return

    const entry = manifest[key] ?? findEntryByFile(key, manifest)
    if (!entry) return

    if (entry.isEntry === true) return

    if (entry.file && !isPreloadedByHtmlEntry(entry.file) && !seenFiles.has(entry.file)) {
      seenFiles.add(entry.file)
      files.push(entry.file)
    }

    for (const importedKey of entry.imports ?? []) {
      visit(importedKey)
    }
  }

  visit(manifestKey)
  return files
}

function isPreloadedByHtmlEntry(file: string): boolean {
  return /(?:^|\/)vue\.runtime\./.test(file)
}

function findEntryByFile(file: string, manifest: ViteManifest): ViteManifestEntry | undefined {
  return Object.values(manifest).find((entry) => entry.file === file)
}

function normalizeRoutePath(pathname: string): string {
  const withoutQuery = pathname.split(/[?#]/, 1)[0] || '/'
  const withLeadingSlash = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`
  return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/$/, '') : withLeadingSlash
}

function assetHref(file: string, basePath: string): string {
  const normalizedBase = normalizeBasePath(basePath)
  return `${normalizedBase}${file.replace(/^\//, '')}`
}

function normalizeBasePath(basePath: string): string {
  if (!basePath || basePath === '/') return '/'
  const prefixed = basePath.startsWith('/') ? basePath : `/${basePath}`
  return prefixed.endsWith('/') ? prefixed : `${prefixed}/`
}
