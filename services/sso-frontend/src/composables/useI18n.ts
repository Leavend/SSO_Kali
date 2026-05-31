/**
 * useI18n — lightweight i18n composable.
 *
 * Tidak bergantung pada vue-i18n package. Cukup baca nested key dari
 * locale JSON dan interpolasi `{placeholder}` sederhana.
 *
 * Mendukung:
 *   - Dot-notation key: `t('auth.login.title')`
 *   - Interpolasi: `t('portal.footer', { year: 2026 })`
 *   - Fallback ke key bila tidak ditemukan (dev-friendly).
 *
 * Locale aktif di-set dari preferensi tersimpan atau default produk (`id`),
 * lalu disinkronkan ke `<html lang>` dan bisa di-switch runtime.
 */

import { computed, ref, type ComputedRef } from 'vue'
import enLocale from '@/locales/en.json'
import idLocale from '@/locales/id.json'

type LocaleMessages = Record<string, unknown>
export type SupportedLocale = 'id' | 'en'

const STORAGE_KEY = 'dev-sso-locale' as const
const DEFAULT_LOCALE: SupportedLocale = 'id'

const locales: Record<SupportedLocale, LocaleMessages> = {
  id: idLocale as LocaleMessages,
  en: enLocale as LocaleMessages,
}

const activeLocale = ref<SupportedLocale>(detectInitialLocale())

syncDocumentLocale(activeLocale.value)

function resolveKey(messages: LocaleMessages, key: string): string | undefined {
  const segments = key.split('.')
  let current: unknown = messages

  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[segment]
  }

  return typeof current === 'string' ? current : undefined
}

function interpolate(template: string, params: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/gu, (_, key: string) => {
    const value = params[key]
    return value !== undefined ? String(value) : `{${key}}`
  })
}

export type UseI18nReturn = {
  /** Translate key dengan optional interpolasi. */
  t: (key: string, params?: Record<string, unknown>) => string
  /** Reactive locale code. */
  locale: ComputedRef<SupportedLocale>
  /** Supported locales for switchers. */
  availableLocales: readonly SupportedLocale[]
  /** Persist locale and update <html lang>. */
  setLocale: (locale: SupportedLocale) => void
}

export function useI18n(): UseI18nReturn {
  const locale = computed<SupportedLocale>(() => activeLocale.value)

  function t(key: string, params?: Record<string, unknown>): string {
    const messages = locales[locale.value]
    const template = resolveKey(messages, key) ?? resolveKey(locales[DEFAULT_LOCALE], key)

    if (!template) {
      if (import.meta.env.DEV) {
        console.warn(`[i18n] Missing key: "${key}"`)
      }
      return key
    }

    return params ? interpolate(template, params) : template
  }

  function setLocale(locale: SupportedLocale): void {
    activeLocale.value = locale
    syncDocumentLocale(locale)
    persistLocale(locale)
  }

  return { t, locale, availableLocales: ['id', 'en'], setLocale }
}

function detectInitialLocale(): SupportedLocale {
  const stored = readStoredLocale()
  if (stored) return stored

  return DEFAULT_LOCALE
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

function syncDocumentLocale(locale: SupportedLocale): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('lang', locale)
}

function persistLocale(locale: SupportedLocale): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // Locale persistence is best-effort; runtime language still updates.
  }
}
