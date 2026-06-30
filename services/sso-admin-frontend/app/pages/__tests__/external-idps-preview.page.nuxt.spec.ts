import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import { ApiError } from '@/lib/api/api-client'
import type {
  ExternalIdentityProvider,
  ExternalIdpMappingPreviewResponse,
} from '@/types/external-idps.types'

const previewMock = vi.fn<(k: string, c: unknown) => Promise<ExternalIdpMappingPreviewResponse>>()
vi.mock('@/services/external-idps.api', () => ({
  externalIdpsApi: {
    list: vi.fn<() => Promise<unknown>>(),
    create: vi.fn<(p: unknown) => Promise<unknown>>(),
    update: vi.fn<(k: string, p: unknown) => Promise<unknown>>(),
    show: vi.fn<(k: string) => Promise<unknown>>(),
    previewMapping: previewMock,
    remove: vi.fn<(k: string) => Promise<void>>(),
  },
}))
const PROVIDER: ExternalIdentityProvider = {
  provider_key: 'acme',
  display_name: 'Acme IdP',
  issuer: 'https://i',
  metadata_url: 'https://m',
  client_id: 'c',
  enabled: true,
  has_client_secret: true,
}
const providersRef = ref<readonly ExternalIdentityProvider[] | null>([PROVIDER])
vi.mock('@/composables/useExternalIdpsList', () => ({
  useExternalIdpsList: () => ({
    providers: providersRef,
    viewState: computed(() => 'ready' as const),
    isStale: computed(() => false),
    requestId: computed(() => null),
    pending: ref(false),
    refresh: vi.fn<() => Promise<void>>(async () => {}),
  }),
}))
let permitted: string[] = []
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { display_name: 'Admin', subject_id: 'a1' },
    ensureSession: vi.fn<() => Promise<string>>(async () => 'authenticated'),
    hasPermission: (p: string) => permitted.includes(p),
    get roles() {
      return [] as readonly string[]
    },
  }),
}))
vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      let val: unknown = enLocale
      for (const part of key.split('.')) val = (val as Record<string, unknown>)?.[part]
      if (typeof val !== 'string') return key
      return params
        ? val.replace(/\{(\w+)\}/gu, (_: string, k: string) => String(params[k] ?? ''))
        : val
    },
  }),
}))
mockNuxtImport('navigateTo', () => vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}))
const Page = (await import('../external-idps.vue')).default

async function openPreview(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
  await wrapper.find('[data-testid="external-idp-select-acme"]').trigger('click')
  await flushPromises()
  await wrapper.find('[data-testid="external-idp-preview"]').trigger('click')
  await flushPromises()
}

beforeEach(() => {
  permitted = ['admin.external-idps.read', 'admin.external-idps.write']
  providersRef.value = [PROVIDER]
  previewMock.mockReset()
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('external-idps mapping preview', () => {
  it('blocks invalid JSON client-side (no API call)', async () => {
    const wrapper = await mountSuspended(Page)
    await openPreview(wrapper)
    await wrapper.find('[data-testid="idp-preview-claims"]').setValue('{bad json')
    await wrapper.find('[data-testid="idp-preview-submit"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="idp-preview-parse-error"]').exists()).toBe(true)
    expect(previewMock).not.toHaveBeenCalled()
  })

  it('runs the preview and renders the mapped result + safe-to-link', async () => {
    previewMock.mockResolvedValue({
      preview: {
        mapped: { subject: 'ext-1', email: 'u@x.test' },
        errors: [],
        warnings: ['Email missing fallback'],
        missing_email_strategy: 'reject',
        safe_to_link: true,
      },
    })
    const wrapper = await mountSuspended(Page)
    await openPreview(wrapper)
    await wrapper
      .find('[data-testid="idp-preview-claims"]')
      .setValue('{"sub":"ext-1","email":"u@x.test"}')
    await wrapper.find('[data-testid="idp-preview-submit"]').trigger('click')
    await flushPromises()
    expect(previewMock).toHaveBeenCalledWith('acme', { sub: 'ext-1', email: 'u@x.test' })
    const panel = wrapper.find('[data-testid="idp-preview-result"]')
    expect(panel.exists()).toBe(true)
    expect(panel.text()).toContain('ext-1') // mapped subject rendered
    expect(panel.text()).toContain(enLocale.external_idps.preview_safe)
  })

  it('surfaces safe copy + REF on a 5xx without leaking the raw id', async () => {
    previewMock.mockRejectedValue(new ApiError(500, 'boom', undefined, {}, 'req-500'))
    const wrapper = await mountSuspended(Page)
    await openPreview(wrapper)
    await wrapper.find('[data-testid="idp-preview-claims"]').setValue('{"sub":"x"}')
    await wrapper.find('[data-testid="idp-preview-submit"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="idp-preview-error"]').text()).toContain(
      enLocale.common.error_generic,
    )
    expect(wrapper.html()).not.toContain('req-500')
  })
})
