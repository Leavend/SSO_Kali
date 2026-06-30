// SSR token-leak fixture: a representative SSO error-template catalog so the §3.3
// gate renders the page READY. Admin-authored end-user error copy — no token,
// secret, session id, or PII. Deliberately free of any 10/16/18-digit run and of
// any token-name substring so the STRICT collectors stay honest.
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({
  templates: [
    {
      error_code: 'access_denied',
      locale: 'en',
      title: 'Access denied',
      message: 'You do not have access to this application. Contact your administrator.',
      action_label: 'Back to sign-in',
      action_url: 'https://sso.example/help',
      retry_allowed: false,
      alternative_login_allowed: true,
      is_enabled: true,
    },
    {
      error_code: 'access_denied',
      locale: 'id',
      title: 'Akses ditolak',
      message: 'Anda tidak memiliki akses ke aplikasi ini. Hubungi administrator Anda.',
      action_label: 'Kembali ke masuk',
      action_url: null,
      retry_allowed: false,
      alternative_login_allowed: true,
      is_enabled: false,
    },
  ],
}))
