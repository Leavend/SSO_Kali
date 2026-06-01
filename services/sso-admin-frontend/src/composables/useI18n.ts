import { computed, ref, type ComputedRef } from 'vue'
import enLocale from '@/locales/en.json'
import idLocale from '@/locales/id.json'

type LocaleMessages = Record<string, unknown>
export type SupportedLocale = 'id' | 'en'

const DEFAULT_LOCALE: SupportedLocale = 'id'
const STORAGE_KEY = 'dev-sso-admin-locale' as const

const locales: Record<SupportedLocale, LocaleMessages> = {
  id: idLocale as LocaleMessages,
  en: enLocale as LocaleMessages,
}

const activeLocale = ref<SupportedLocale>(detectInitialLocale())

syncDocumentLocale(activeLocale.value)

export type UseI18nReturn = {
  readonly availableLocales: readonly SupportedLocale[]
  readonly locale: ComputedRef<SupportedLocale>
  readonly setLocale: (locale: SupportedLocale) => void
  readonly t: (key: string, params?: Record<string, unknown>) => string
}

export function useI18n(): UseI18nReturn {
  const locale = computed<SupportedLocale>(() => activeLocale.value)

  function t(key: string, params?: Record<string, unknown>): string {
    const template =
      resolveKey(locales[locale.value], key) ?? resolveKey(locales[DEFAULT_LOCALE], key)
    if (!template) return key

    return params ? interpolate(template, params) : template
  }

  function setLocale(locale: SupportedLocale): void {
    activeLocale.value = locale
    syncDocumentLocale(locale)
    persistLocale(locale)
  }

  return { availableLocales: ['id', 'en'], locale, setLocale, t }
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

function detectInitialLocale(): SupportedLocale {
  return readStoredLocale() ?? readDocumentLocale() ?? readNavigatorLocale() ?? DEFAULT_LOCALE
}

function normalizeLocale(value: string | null | undefined): SupportedLocale | null {
  if (!value) return null
  const base = value.toLowerCase().split('-')[0]
  return base === 'id' || base === 'en' ? base : null
}

function readStoredLocale(): SupportedLocale | null {
  if (typeof window === 'undefined') return null
  try {
    return normalizeLocale(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}

function readDocumentLocale(): SupportedLocale | null {
  if (typeof document === 'undefined') return null
  return normalizeLocale(document.documentElement.getAttribute('lang'))
}

function readNavigatorLocale(): SupportedLocale | null {
  if (typeof navigator === 'undefined') return null
  return normalizeLocale(navigator.language)
}

function syncDocumentLocale(locale: SupportedLocale): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('lang', locale)
}

function persistLocale(locale: SupportedLocale): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // Preference persistence is best-effort.
  }
}
