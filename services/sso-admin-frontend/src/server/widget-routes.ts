/**
 * Same-origin allow-list for the admin account-widget proxy.
 *
 * Only `/widget/<segment>...` paths are forwarded to the backend so the admin
 * BFF never becomes an open relay. Everything else (API, OIDC, static assets)
 * is handled by its own route. Mirrors the portal BFF's `/widget/` proxying.
 */
export function shouldProxyAdminWidgetPath(pathname: string): boolean {
  return pathname.startsWith('/widget/')
}
