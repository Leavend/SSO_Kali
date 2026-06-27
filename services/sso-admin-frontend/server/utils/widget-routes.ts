/**
 * Same-origin allow-list for the admin account-widget proxy. Only
 * `/widget/<segment>...` paths are forwarded to the backend so the admin BFF
 * never becomes an open relay. Mirrors the portal BFF's `/widget/` proxying.
 */
export function shouldProxyAdminWidgetPath(pathname: string): boolean {
  return pathname.startsWith('/widget/')
}
