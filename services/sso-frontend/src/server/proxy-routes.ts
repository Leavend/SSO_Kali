export function shouldProxyPortalPath(pathname: string): boolean {
  return (
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/mfa/') ||
    pathname === '/api/profile' ||
    pathname.startsWith('/api/profile/') ||
    pathname === '/connect/consent' ||
    pathname === '/connect/logout' ||
    pathname.startsWith('/connect/logout/') ||
    pathname === '/introspect' ||
    pathname.startsWith('/oauth/') ||
    pathname.startsWith('/oauth2/') ||
    pathname.startsWith('/.well-known/') ||
    pathname === '/authorize' ||
    pathname === '/token' ||
    pathname === '/revocation' ||
    pathname === '/userinfo' ||
    pathname === '/jwks'
  )
}
