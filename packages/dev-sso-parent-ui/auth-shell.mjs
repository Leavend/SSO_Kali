/**
 * @parent-ui/auth-shell — shared auth shell constants and theme utilities.
 *
 * This module is consumed by the SSO frontend web layer for theming
 * and auth shell layout configuration.
 */

export const AUTH_SHELL = {
  appName: 'Dev-SSO',
  logoAlt: 'Dev-SSO Logo',
  footerText: '© 2026 Dev-SSO Platform',
}

export function normalizeTheme(raw) {
  if (raw === 'dark' || raw === 'light') return raw
  return 'system'
}

export function getNextTheme(current) {
  if (current === 'light') return 'dark'
  if (current === 'dark') return 'system'
  return 'light'
}
