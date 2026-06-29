import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import { ApiError } from '@/lib/api/api-client'
import type { ExternalIdentityProvider } from '@/types/external-idps.types'

const removeMock = vi.fn<(k: string) => Promise<void>>()
vi.mock('@/services/external-idps.api', () => ({
  externalIdpsApi: {
    list: vi.fn<() => Promise<unknown>>(),
    create: vi.fn<(p: unknown) => Promise<unknown>>(),
    update: vi.fn<(k: string, p: unknown) => Promise<unknown>>(),
    show: vi.fn<(k: string) => Promise<unknown>>(),
    previewMapping: vi.fn<(k: string, c: unknown) => Promise<unknown>>(),
    remove: removeMock,
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
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
vi.mock('@/composables/useExternalIdpsList', () => ({
  useExternalIdpsList: () => ({
    providers: providersRef,
    viewState: computed(() => 'ready' as const),
    isStale: computed(() => false),
    requestId: computed(() => null),
    pending: ref(false),
    refresh: refreshMock,
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

async function openDelete(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
  await wrapper.find('[data-testid="external-idp-select-acme"]').trigger('click')
  await flushPromises()
  await wrapper.find('[data-testid="external-idp-delete"]').trigger('click')
  await flushPromises()
}

beforeEach(() => {
  permitted = ['admin.external-idps.read', 'admin.external-idps.write', 'admin.sessions.terminate']
  providersRef.value = [PROVIDER]
  removeMock.mockReset()
  refreshMock.mockReset()
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('external-idps delete — double gate', () => {
  it('hides Delete without sessions.terminate (single gate is not enough)', async () => {
    permitted = ['admin.external-idps.read', 'admin.external-idps.write']
    const wrapper = await mountSuspended(Page)
    await wrapper.find('[data-testid="external-idp-select-acme"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="external-idp-delete"]').exists()).toBe(false)
  })

  it('confirm deletes, refreshes, and reports success; cancel calls no API', async () => {
    removeMock.mockResolvedValue(undefined)
    const wrapper = await mountSuspended(Page)
    await openDelete(wrapper)
    expect(removeMock).not.toHaveBeenCalled()
    await wrapper.find('[data-testid="privileged-action-cancel"]').trigger('click')
    await flushPromises()
    expect(removeMock).not.toHaveBeenCalled()
    await openDelete(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(removeMock).toHaveBeenCalledWith('acme')
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="external-idps-action-success"]').text()).toBe(
      enLocale.external_idps.delete_success,
    )
  })

  it('maps 422 not-found to SAFE copy (never the raw message) and does not refresh', async () => {
    removeMock.mockRejectedValue(
      new ApiError(422, 'External IdP not found.', 'external_idp_invalid', {}, 'req-422'),
    )
    const wrapper = await mountSuspended(Page)
    await openDelete(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="privileged-action-error"]').text()).toContain(
      enLocale.external_idps.delete_invalid,
    )
    expect(wrapper.html()).not.toContain('External IdP not found.')
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('surfaces step-up on 428', async () => {
    removeMock.mockRejectedValue(
      new ApiError(
        428,
        'reauth',
        'reauth_required',
        { step_up_url: 'https://idp.example/step-up' },
        'req-428',
      ),
    )
    const wrapper = await mountSuspended(Page)
    await openDelete(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(
      wrapper.find('[data-testid="privileged-action-stepup"]').find('a').attributes('href'),
    ).toBe('https://idp.example/step-up')
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
