// SSR token-leak fixture: a representative SSO error-template catalog so the §3.3
// gate renders the page READY. Admin-authored end-user error copy — no token,
// secret, session id, or PII. Deliberately free of any 10/16/18-digit run and of
// any token-name substring so the STRICT collectors stay honest.
//
// The real backend filters the index to ONE locale per request (`?locale`,
// default 'id'); the composable fetches 'id' and 'en' separately and merges. This
// fixture mirrors that — it returns only the rows for the requested locale so the
// two fetches don't yield duplicate composite keys.
import { defineEventHandler, getQuery } from 'h3'

const TEMPLATES = [
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
] as const

export default defineEventHandler((event) => {
  const locale = getQuery(event).locale
  const filtered =
    locale === 'en' || locale === 'id'
      ? TEMPLATES.filter((template) => template.locale === locale)
      : TEMPLATES
  return { templates: filtered }
})
