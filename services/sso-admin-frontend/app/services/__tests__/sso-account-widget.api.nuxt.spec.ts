// Named *.nuxt.spec.ts: the service uses useRuntimeConfig (Nuxt auto-import),
// so it needs the Nuxt environment where mockNuxtImport is available.
// Per test-hygiene rule: nuxt-runtime tests = *.nuxt.spec.ts.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { resolveWidgetBaseUrl, safeWidgetAppUrl } from '../sso-account-widget.api'

// ---------------------------------------------------------------------------
// Mocks — hoisted before imports by Vitest
// ---------------------------------------------------------------------------

// Mutable config object captured by the mock factory so each test can
// mutate config.ssoWidgetBaseUrl and the mock sees the new value at call time.
const config = vi.hoisted(() => ({ ssoWidgetBaseUrl: '' as string }))

mockNuxtImport('useRuntimeConfig', () => {
  return () => ({
    app: { baseURL: '/' },
    public: { ssoWidgetBaseUrl: config.ssoWidgetBaseUrl },
  })
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  config.ssoWidgetBaseUrl = ''
  vi.clearAllMocks()
})

describe('sso-account-widget.api base URL', () => {
  it('reads the same-origin default and trims a trailing slash', () => {
    config.ssoWidgetBaseUrl = ''
    expect(resolveWidgetBaseUrl()).toBe('')

    config.ssoWidgetBaseUrl = 'https://sso.test/'
    expect(resolveWidgetBaseUrl()).toBe('https://sso.test')
  })

  it('rejects non-http(s) app URLs', () => {
    expect(safeWidgetAppUrl('https://app.test/x')).toBe('https://app.test/x')
    expect(safeWidgetAppUrl('javascript:alert(1)')).toBeNull()
  })
})
