// app/composables/__tests__/useSsoErrorTemplates.nuxt.spec.ts
import { describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import { useSsoErrorTemplates } from '@/composables/useSsoErrorTemplates'
import type { SsoErrorTemplate } from '@/types/sso-error-templates.types'

const tpl: SsoErrorTemplate = {
  error_code: 'access_denied',
  locale: 'en',
  title: 'Access denied',
  message: 'No access.',
  action_label: 'Back',
  action_url: null,
  retry_allowed: false,
  alternative_login_allowed: false,
  is_enabled: true,
}

const { useAsyncDataMock } = vi.hoisted(() => ({ useAsyncDataMock: vi.fn<() => unknown>() }))
mockNuxtImport('useAsyncData', () => useAsyncDataMock)

describe('useSsoErrorTemplates', () => {
  it('exposes templates + ready view-state when data resolves', () => {
    useAsyncDataMock.mockReturnValue({
      data: ref({ templates: [tpl] }),
      pending: ref(false),
      error: ref(null),
      refresh: vi.fn<() => Promise<void>>(),
    })
    const { templates, viewState } = useSsoErrorTemplates()
    expect(templates.value).toEqual([tpl])
    expect(viewState.value).toBe('ready')
  })
  it('reports loading while pending with no data', () => {
    useAsyncDataMock.mockReturnValue({
      data: ref(null),
      pending: ref(true),
      error: ref(null),
      refresh: vi.fn<() => Promise<void>>(),
    })
    expect(useSsoErrorTemplates().viewState.value).toBe('loading')
  })
})
