import { computed, type ComputedRef } from 'vue'
import idLocale from '@/locales/id.json'
import enLocale from '@/locales/en.json'

type LocaleMessages = Record<string, unknown>
export type SupportedLocale = 'id' | 'en'

const DEFAULT_LOCALE: SupportedLocale = 'id'
const LOCALE_COOKIE = 'admin_locale' as const
const LOCALE_STATE_KEY = 'admin-locale' as const

// Both catalogs are statically bundled: SSR must resolve the active locale's
// messages synchronously, which also removes the legacy async loadLocale /
// localeVersion lazy-load machinery.
const MESSAGES: Record<SupportedLocale, LocaleMessages> = {
  id: idLocale as LocaleMessages,
  en: enLocale as LocaleMessages,
}

export type UseI18nReturn = {
  readonly availableLocales: readonly SupportedLocale[]
  readonly locale: ComputedRef<SupportedLocale>
  readonly setLocale: (locale: SupportedLocale) => void
  readonly t: (key: string, params?: Record<string, unknown>) => string
}

export function useI18n(): UseI18nReturn {
  // Persisted, SSR-readable preference. The cookie is the single initial-locale
  // source so server and client hydrate to the SAME value (no navigator/document
  // sniffing on init — that would diverge SSR vs CSR and break hydration).
  const localeCookie = useCookie<SupportedLocale>(LOCALE_COOKIE, {
    default: () => DEFAULT_LOCALE,
    sameSite: 'lax',
    path: '/',
  })

  // Request-scoped (NOT module-scoped) — avoids cross-request locale bleed on the server.
  const localeState = useState<SupportedLocale>(
    LOCALE_STATE_KEY,
    () => normalizeLocale(localeCookie.value) ?? DEFAULT_LOCALE,
  )

  const locale = computed<SupportedLocale>(() => localeState.value)

  function t(key: string, params?: Record<string, unknown>): string {
    const template =
      resolveKey(MESSAGES[localeState.value], key) ?? resolveKey(MESSAGES[DEFAULT_LOCALE], key)
    if (!template) return key
    return params ? interpolate(template, params) : template
  }

  function setLocale(next: SupportedLocale): void {
    localeState.value = next
    localeCookie.value = next
    // Browser-only: keep <html lang> in sync. Guarded so SSR never touches `document`.
    if (import.meta.client) {
      document.documentElement.setAttribute('lang', next)
    }
  }

  return { availableLocales: ['id', 'en'] as const, locale, setLocale, t }
}

function normalizeLocale(value: string | null | undefined): SupportedLocale | null {
  if (!value) return null
  const base = value.toLowerCase().split('-')[0]
  return base === 'id' || base === 'en' ? base : null
}

function resolveKey(messages: LocaleMessages, key: string): string | undefined {
  let current: unknown = messages
  for (const segment of key.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return typeof current === 'string' ? current : undefined
}

function interpolate(template: string, params: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/gu, (_, key: string) => {
    const value = params[key]
    return value === undefined ? `{${key}}` : String(value)
  })
}
