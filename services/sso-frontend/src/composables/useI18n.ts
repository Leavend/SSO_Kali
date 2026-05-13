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
 * Locale aktif di-set via `<html lang>` dan bisa di-switch runtime.
 */

import { computed, type ComputedRef } from 'vue'
import idLocale from '@/locales/id.json'

type LocaleMessages = Record<string, unknown>

const locales: Record<string, LocaleMessages> = {
  id: idLocale as LocaleMessages,
}

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
  /** Reactive locale code (mis. 'id'). */
  locale: ComputedRef<string>
}

export function useI18n(): UseI18nReturn {
  const locale = computed<string>(() => {
    if (typeof document === 'undefined') return 'id'
    return document.documentElement.getAttribute('lang') ?? 'id'
  })

  function t(key: string, params?: Record<string, unknown>): string {
    const messages = locales[locale.value] ?? locales['id']!
    const template = resolveKey(messages, key)

    if (!template) {
      if (import.meta.env.DEV) {
        console.warn(`[i18n] Missing key: "${key}"`)
      }
      return key
    }

    return params ? interpolate(template, params) : template
  }

  return { t, locale }
}
