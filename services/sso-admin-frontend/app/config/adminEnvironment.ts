/**
 * Admin environment derived from the SINGLE source of truth: runtimeConfig.public.
 *
 * SSR-safe: useRuntimeConfig() returns identical values on server and client and
 * touches no browser globals. Call within Nuxt context (component setup, plugin,
 * or during an SSR request).
 *
 * Resolves the prior "two sources for ssoBaseUrl" smell: ssoBaseUrl is no longer
 * read from import.meta.env here while runtimeConfig holds it elsewhere —
 * runtimeConfig.public is now the only source.
 */
export interface AdminEnvironment {
  readonly ssoBaseUrl: string
  readonly widgetBaseUrl: string
  readonly docsBaseUrl: string
  readonly publicBasePath: string
}

export function getAdminEnvironment(): AdminEnvironment {
  const { public: pub } = useRuntimeConfig()
  return {
    ssoBaseUrl: pub.ssoBaseUrl,
    widgetBaseUrl: pub.ssoWidgetBaseUrl,
    docsBaseUrl: pub.docsBaseUrl,
    publicBasePath: pub.basePath,
  }
}

/**
 * Absolute URL on the SSO portal origin. Falls back to this app's root when
 * ssoBaseUrl is unset so an escape link never dead-ends on a broken href.
 */
export function portalUrl(path = '/home'): string {
  const base = (getAdminEnvironment().ssoBaseUrl ?? '').replace(/\/$/u, '')
  return base ? `${base}${path}` : '/'
}
