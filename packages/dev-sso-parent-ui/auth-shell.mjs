/**
 * @parent-ui/auth-shell — shared auth shell constants and theme utilities.
 *
 * This module is consumed by the SSO frontend web layer for theming,
 * branding, copy, and auth shell layout configuration.
 */

export const AUTH_SHELL = {
  appName: 'Dev-SSO',
  logoAlt: 'Dev-SSO Logo',
  footerText: '© 2026 Dev-SSO Platform',
  theme: {
    defaultTheme: 'system',
    attribute: 'data-theme',
    darkClass: 'dark',
    toggleId: 'theme-toggle',
    toggleClass: 'theme-toggle-btn',
    lightLabel: 'Beralih ke mode terang',
    darkLabel: 'Beralih ke mode gelap',
  },
  brand: {
    name: 'Dev-SSO',
    subtitle: 'Single Sign-On Platform',
  },
  footer: {
    copyright: '© 2026 Dev-SSO Platform',
    separator: '·',
    links: [],
  },
  copy: {
    loginTitle: 'Masuk ke akun',
    loginSubtitle: 'Gunakan akun SSO untuk melanjutkan.',
    continueButton: 'Lanjutkan',
    processingButton: 'Memproses...',
    registerPrompt: 'Belum punya akun? Daftar',
  },
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
