import { computed, ref, type ComputedRef } from 'vue'
import idLocale from '@/locales/id.json'

type LocaleMessages = Record<string, unknown>
export type SupportedLocale = 'id' | 'en'

const DEFAULT_LOCALE: SupportedLocale = 'id'
const STORAGE_KEY = 'dev-sso-admin-locale' as const

const locales: Record<SupportedLocale, LocaleMessages> = {
  id: idLocale as LocaleMessages,
  en: {},
}
const loadingLocales = new Map<SupportedLocale, Promise<void>>()

const activeLocale = ref<SupportedLocale>(detectInitialLocale())
const localeVersion = ref(0)

syncDocumentLocale(activeLocale.value)

export type UseI18nReturn = {
  readonly availableLocales: readonly SupportedLocale[]
  readonly locale: ComputedRef<SupportedLocale>
  readonly setLocale: (locale: SupportedLocale) => Promise<void>
  readonly loadLocale: (locale: SupportedLocale) => Promise<void>
  readonly t: (key: string, params?: Record<string, unknown>) => string
}

/**
 * Module-level translation — works outside Vue setup context (e.g. Pinia stores).
 * Falls back to DEFAULT_LOCALE when the key doesn't exist in the active locale.
 */
export function translate(key: string, params?: Record<string, unknown>): string {
  const template =
    resolveKey(messagesFor(activeLocale.value), key) ?? resolveKey(messagesFor(DEFAULT_LOCALE), key)
  if (!template) return key

  return params ? interpolate(template, params) : template
}

export function useI18n(): UseI18nReturn {
  const locale = computed<SupportedLocale>(() => activeLocale.value)

  function t(key: string, params?: Record<string, unknown>): string {
    const template =
      resolveKey(messagesFor(locale.value), key) ?? resolveKey(messagesFor(DEFAULT_LOCALE), key)
    if (!template) return key

    return params ? interpolate(template, params) : template
  }

  async function setLocale(locale: SupportedLocale): Promise<void> {
    await loadLocale(locale)
    activeLocale.value = locale
    syncDocumentLocale(locale)
    persistLocale(locale)
  }

  return { availableLocales: ['id', 'en'], locale, setLocale, loadLocale, t }
}

export async function loadLocale(locale: SupportedLocale): Promise<void> {
  if (locale === 'id') return
  if (Object.keys(locales[locale]).length > 0) return

  const existing = loadingLocales.get(locale)
  if (existing) return existing

  const nextLoad = import('@/locales/en.json').then((module) => {
    locales.en = (module.default ?? module) as LocaleMessages
    localeVersion.value += 1
  })
  loadingLocales.set(locale, nextLoad)

  try {
    await nextLoad
  } finally {
    loadingLocales.delete(locale)
  }
}

function messagesFor(locale: SupportedLocale): LocaleMessages {
  // Track lazy locale loads so existing render effects re-run when messages arrive.
  void localeVersion.value
  return locales[locale]
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

if (activeLocale.value !== DEFAULT_LOCALE) {
  void loadLocale(activeLocale.value)
}
