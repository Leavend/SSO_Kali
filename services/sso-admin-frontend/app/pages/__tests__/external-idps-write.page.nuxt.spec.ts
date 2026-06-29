import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import { ApiError } from '@/lib/api/api-client'
import type {
  ExternalIdentityProvider,
  ExternalIdpDetailResponse,
} from '@/types/external-idps.types'

const createMock = vi.fn<(p: unknown) => Promise<ExternalIdpDetailResponse>>()
const updateMock = vi.fn<(k: string, p: unknown) => Promise<ExternalIdpDetailResponse>>()
vi.mock('@/services/external-idps.api', () => ({
  externalIdpsApi: {
    list: vi.fn<() => Promise<unknown>>(),
    create: createMock,
    update: updateMock,
    show: vi.fn<(k: string) => Promise<unknown>>(),
    previewMapping: vi.fn<(k: string, c: unknown) => Promise<unknown>>(),
    remove: vi.fn<(k: string) => Promise<void>>(),
  },
}))

const PROVIDER: ExternalIdentityProvider = {
  provider_key: 'acme',
  display_name: 'Acme IdP',
  issuer: 'https://idp.acme.test',
  metadata_url: 'https://idp.acme.test/m',
  client_id: 'sso-client',
  enabled: true,
  has_client_secret: true,
  health_status: 'healthy',
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
// Real i18n echo via enLocale so assertions read literal English.
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

async function openCreate(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
  await wrapper.find('[data-testid="external-idps-create"]').trigger('click')
  await flushPromises()
}
async function fillValidCreate(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
  await wrapper.find('[data-testid="idp-field-provider_key"]').setValue('newidp')
  await wrapper.find('[data-testid="idp-field-display_name"]').setValue('New IdP')
  await wrapper.find('[data-testid="idp-field-issuer"]').setValue('https://new.test')
  await wrapper.find('[data-testid="idp-field-metadata_url"]').setValue('https://new.test/m')
  await wrapper.find('[data-testid="idp-field-client_id"]').setValue('newclient')
}

beforeEach(() => {
  permitted = ['admin.external-idps.read', 'admin.external-idps.write']
  providersRef.value = [PROVIDER]
  createMock.mockReset()
  updateMock.mockReset()
  refreshMock.mockReset()
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('external-idps create', () => {
  it('opens the form, creates, refreshes, and reports success', async () => {
    createMock.mockResolvedValue({ provider: { ...PROVIDER, provider_key: 'newidp' } })
    const wrapper = await mountSuspended(Page)
    await openCreate(wrapper)
    await fillValidCreate(wrapper)
    await wrapper.find('[data-testid="external-idp-form"]').trigger('submit')
    await flushPromises()
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ provider_key: 'newidp' }))
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="external-idps-action-success"]').text()).toBe(
      enLocale.external_idps.create_success,
    )
  })

  it('maps a 422 duplicate to SAFE copy and NEVER renders the raw SQL message', async () => {
    createMock.mockRejectedValue(
      new ApiError(
        422,
        "SQLSTATE[23000]: Integrity constraint violation: 1062 Duplicate entry 'acme' for key 'external_identity_providers_provider_key_unique'",
        'external_idp_invalid',
        {},
        'req-422',
      ),
    )
    const wrapper = await mountSuspended(Page)
    await openCreate(wrapper)
    await fillValidCreate(wrapper)
    await wrapper.find('[data-testid="external-idp-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-testid="external-idp-form-error"]').text()).toContain(
      enLocale.external_idps.create_invalid,
    )
    expect(wrapper.html()).not.toContain('SQLSTATE')
    expect(wrapper.html()).not.toContain('external_identity_providers_provider_key_unique')
    expect(wrapper.html()).not.toContain('req-422')
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('surfaces the step-up link on 428', async () => {
    createMock.mockRejectedValue(
      new ApiError(
        428,
        'reauth',
        'reauth_required',
        { step_up_url: 'https://idp.example/step-up' },
        'req-428',
      ),
    )
    const wrapper = await mountSuspended(Page)
    await openCreate(wrapper)
    await fillValidCreate(wrapper)
    await wrapper.find('[data-testid="external-idp-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-testid="external-idp-form-stepup"]').attributes('href')).toBe(
      'https://idp.example/step-up',
    )
    expect(refreshMock).not.toHaveBeenCalled()
  })
})

describe('external-idps update', () => {
  it('edits the selected provider and reports success', async () => {
    updateMock.mockResolvedValue({ provider: { ...PROVIDER, display_name: 'Acme Renamed' } })
    const wrapper = await mountSuspended(Page)
    await wrapper.find('[data-testid="external-idp-select-acme"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="external-idp-edit"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="idp-field-display_name"]').setValue('Acme Renamed')
    await wrapper.find('[data-testid="external-idp-form"]').trigger('submit')
    await flushPromises()
    expect(updateMock).toHaveBeenCalledWith(
      'acme',
      expect.objectContaining({ display_name: 'Acme Renamed' }),
    )
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="external-idps-action-success"]').text()).toBe(
      enLocale.external_idps.update_success,
    )
  })
})
