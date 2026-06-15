/**
 * useI18n — lightweight i18n composable.
 *
 * Tidak bergantung pada vue-i18n package. Membaca nested key dari
 * locale JSON dan interpolasi `{placeholder}` sederhana.
 *
 * Mendukung:
 *   - Dot-notation key: `t('auth.login.title')`
 *   - Interpolasi: `t('portal.footer', { year: 2026 })`
 *   - Fallback ke key bila tidak ditemukan (dev-friendly).
 *
 * Strategi pemuatan (ISS-PERF2 — P1, lazy i18n):
 *   1. Bundle TIDAK mengimpor kedua locale secara statis. Sebelumnya chunk
 *      `useI18n-*.js` adalah **59 KB** (≈ 30 KB per locale × 2 bahasa)
 *      karena Rollup menggabungkan seluruh namespace ke satu chunk.
 *   2. Locale **default** (`id`) diimpor statis — sehingga semua key
 *      untuk bahasa Indonesia tersedia **sinkron** sejak entry, tanpa
 *      `await`. Total chunk i18n di entry turun dari 59 KB → ≈ 30 KB.
 *   3. Locale **non-default** (`en`) dimuat dengan dynamic `import()`
 *      saat pertama kali diminta (saat `setLocale('en')` atau
 *      `loadLocale('en')`).
 *   4. Runtime tetap mendukung shell inline via Vite plugin
 *      `injectI18nShell()` untuk first paint super-cepat, namun **tidak
 *      bergantung** padanya — fallback ke `DEFAULT_LOCALE` aman.
 *
 * Locale aktif di-set dari preferensi tersimpan, document lang, navigator,
 * atau default produk (`id`); lalu disinkronkan ke `<html lang>` dan bisa
 * di-switch runtime (otomatis memuat locale baru).
 */

import { computed, ref, shallowRef, type ComputedRef, type ShallowRef } from 'vue'
import idLocale from '@/locales/id/messages.json'

type LocaleMessages = Record<string, unknown>
export type SupportedLocale = 'id' | 'en'

const STORAGE_KEY = 'dev-sso-locale' as const
const DEFAULT_LOCALE: SupportedLocale = 'id'

/**
 * Static import of the default locale. This is the only locale that ships
 * in the entry chunk; everything else is loaded on demand. The shell
 * injected by `injectI18nShell` is overlaid on top so that the few keys
 * needed for first paint are available even before the entry evaluates.
 */
const defaultLocaleBundle: LocaleMessages = idLocale as LocaleMessages
const defaultShellBundle: LocaleMessages = readInjectedShell(DEFAULT_LOCALE)
const defaultMergedBundle: LocaleMessages = { ...defaultLocaleBundle, ...defaultShellBundle }

/**
 * Active-locale messages wrapped in a `shallowRef` so Vue's reactivity
 * tracks the *reassignment* of the whole dictionary when a lazy chunk
 * arrives. Using `shallowRef` (not `ref` / `reactive`) avoids the
 * per-key deep proxy overhead and keeps the reference stable until the
 * next bundle swaps in. Computeds that call `t()` and rely on
 * `activeMessages` therefore re-evaluate exactly once per locale switch
 * — no extra invalidation churn.
 */
const activeMessages: ShallowRef<LocaleMessages> = shallowRef({ ...defaultMergedBundle })
/** Fallback messages (always the default locale). Reactive for the same reason. */
const fallbackMessages: ShallowRef<LocaleMessages> = shallowRef({ ...defaultMergedBundle })
/** In-flight promises for lazy non-default locale loads. */
const localeLoadPromises = new Map<SupportedLocale, Promise<LocaleMessages>>()

const activeLocale = ref<SupportedLocale>(detectInitialLocale())

syncDocumentLocale(activeLocale.value)

// If the active locale isn't the default, kick off the async load so that
// subsequent t() lookups see the right language. This call is fire-and-forget
// (we never block the first paint on a non-default locale).
if (activeLocale.value !== DEFAULT_LOCALE) {
  void ensureMessagesLoaded(activeLocale.value).catch((error) => {
    if (import.meta.env.DEV) console.warn('[i18n] failed to load active locale', error)
  })
}

export type UseI18nReturn = {
  /** Translate key dengan optional interpolasi. */
  t: (key: string, params?: Record<string, unknown>) => string
  /** Reactive locale code. */
  locale: ComputedRef<SupportedLocale>
  /** Supported locales for switchers. */
  availableLocales: readonly SupportedLocale[]
  /** Persist locale and update <html lang>. Triggers lazy load. */
  setLocale: (locale: SupportedLocale) => Promise<void>
  /**
   * Preload a locale in the background. Useful to call from
   * `App.vue#onMounted` so the first non-shell `t()` lookup doesn't
   * block on the network.
   */
  loadLocale: (locale: SupportedLocale) => Promise<void>
}

export function useI18n(): UseI18nReturn {
  const locale = computed<SupportedLocale>(() => activeLocale.value)

  function t(key: string, params?: Record<string, unknown>): string {
    // Read the .value of both shallowRefs to register the dependency.
    const messages = activeMessages.value
    const fallback = fallbackMessages.value
    const template = resolveKey(messages, key) ?? resolveKey(fallback, key)

    if (!template) {
      // Key not in the shell; opportunistically load the full locale and retry.
      void ensureMessagesLoaded(locale.value)
      if (import.meta.env.DEV) {
        console.warn(`[i18n] Missing key: "${key}" (locale=${locale.value})`)
      }
      return key
    }

    return params ? interpolate(template, params) : template
  }

  async function setLocale(locale: SupportedLocale): Promise<void> {
    if (locale === activeLocale.value) {
      // No-op switch (same locale). Still re-apply the messages so test
      // resets (e.g. `useI18n().setLocale('id')` in `afterEach`) restore
      // a known state regardless of what was last loaded.
      activeMessages.value = { ...defaultMergedBundle }
    } else {
      activeLocale.value = locale
      // Reset to the default bundle first so any non-shell `t()` lookup
      // made *before* the new chunk loads falls back to the default
      // language rather than showing a stale previous-locale translation.
      activeMessages.value = { ...defaultMergedBundle }
    }
    syncDocumentLocale(locale)
    persistLocale(locale)
    await ensureMessagesLoaded(locale)
  }

  async function loadLocale(locale: SupportedLocale): Promise<void> {
    await ensureMessagesLoaded(locale)
  }

  return {
    t,
    locale,
    availableLocales: ['id', 'en'],
    setLocale,
    loadLocale,
  }
}

function applyLoadedBundle(locale: SupportedLocale, loaded: LocaleMessages): void {
  if (locale === activeLocale.value) {
    // Reassign the WHOLE shallowRef so any computed that called `t()`
    // (and therefore read `activeMessages.value`) re-evaluates once. The
    // new value also overlays the shell so shell keys remain stable.
    activeMessages.value = { ...defaultMergedBundle, ...loaded }
  }
  if (locale === DEFAULT_LOCALE) {
    fallbackMessages.value = { ...defaultMergedBundle, ...loaded }
  }
}

/** Internal: ensure the full messages for a (non-default) locale are loaded. */
async function ensureMessagesLoaded(locale: SupportedLocale): Promise<LocaleMessages> {
  if (locale === DEFAULT_LOCALE) {
    // Default locale is statically imported; nothing to do.
    return defaultLocaleBundle
  }
  const existing = localeLoadPromises.get(locale)
  if (existing) {
    const loaded = await existing
    applyLoadedBundle(locale, loaded)
    return loaded
  }
  return triggerLocaleLoad(locale)
}

function triggerLocaleLoad(locale: SupportedLocale): Promise<LocaleMessages> {
  // Vite/Rollup turns this into a separate per-locale dynamic chunk.
  const promise = import(
    /* @vite-ignore */ `@/locales/${locale}/messages.json` as string
  ) as Promise<{ default: LocaleMessages } | LocaleMessages>
  const normalized = promise.then((mod) => {
    const messages = (mod as { default?: LocaleMessages }).default ?? (mod as LocaleMessages)
    const result = messages as LocaleMessages
    localeLoadPromises.set(locale, Promise.resolve(result))
    applyLoadedBundle(locale, result)
    return result
  })
  localeLoadPromises.set(locale, normalized)
  return normalized
}

function readInjectedShell(locale: SupportedLocale): LocaleMessages {
  if (typeof document === 'undefined') return {}
  const script = document.getElementById('__sso_i18n_shell__')
  if (!script?.textContent) return {}
  try {
    const parsed = JSON.parse(script.textContent) as Record<
      SupportedLocale,
      LocaleMessages
    >
    return (parsed[locale] ?? {}) as LocaleMessages
  } catch {
    return {}
  }
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
    // Locale persistence is best-effort; runtime language still updates.
  }
}
