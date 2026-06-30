import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import type { ExternalIdpsViewState } from '@/lib/external-idps/external-idps-view-state'
import type { ExternalIdentityProvider } from '@/types/external-idps.types'

const PROVIDER: ExternalIdentityProvider = {
  provider_key: 'acme',
  display_name: 'Acme IdP',
  issuer: 'https://idp.acme.test',
  metadata_url: 'https://idp.acme.test/.well-known/openid-configuration',
  client_id: 'sso-client',
  jwks_uri: 'https://idp.acme.test/jwks',
  allowed_algorithms: ['RS256'],
  scopes: ['openid', 'profile'],
  priority: 100,
  enabled: true,
  is_backup: false,
  tls_validation_enabled: true,
  signature_validation_enabled: true,
  has_client_secret: true,
  health_status: 'healthy',
}

const providersRef = ref<readonly ExternalIdentityProvider[] | null>([PROVIDER])
const viewStateRef = ref<ExternalIdpsViewState>('ready')
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
vi.mock('@/composables/useExternalIdpsList', () => ({
  useExternalIdpsList: () => ({
    providers: providersRef,
    viewState: computed(() => viewStateRef.value),
    isStale: computed(() => false),
    requestId: computed(() => null),
    pending: ref(false),
    refresh: refreshMock,
  }),
}))

let permitted: string[] = []
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { display_name: 'Admin Sentinel', subject_id: 'admin-1' },
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
      if (!params) return val
      return val.replace(/\{(\w+)\}/gu, (_: string, k: string) => String(params[k] ?? ''))
    },
  }),
}))

mockNuxtImport('navigateTo', () => vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}))

const ExternalIdpsPage = (await import('../external-idps.vue')).default

beforeEach(() => {
  permitted = ['admin.external-idps.read']
  providersRef.value = [PROVIDER]
  viewStateRef.value = 'ready'
  refreshMock.mockReset()
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('external-idps page — states', () => {
  it('renders the loading skeleton', async () => {
    viewStateRef.value = 'loading'
    const wrapper = await mountSuspended(ExternalIdpsPage)
    expect(wrapper.find('[data-page="external-idps"]').exists()).toBe(true)
    expect(wrapper.find(`[aria-label="${enLocale.external_idps.loading}"]`).exists()).toBe(true)
  })
  it('renders the forbidden surface', async () => {
    viewStateRef.value = 'forbidden'
    const wrapper = await mountSuspended(ExternalIdpsPage)
    expect(wrapper.text()).toContain(enLocale.external_idps.forbidden_title)
  })
  it('renders the empty surface', async () => {
    viewStateRef.value = 'empty'
    providersRef.value = []
    const wrapper = await mountSuspended(ExternalIdpsPage)
    expect(wrapper.text()).toContain(enLocale.external_idps.empty_title)
  })
  it('renders the providers table in the ready state', async () => {
    const wrapper = await mountSuspended(ExternalIdpsPage)
    expect(wrapper.find('[data-testid="external-idp-select-acme"]').exists()).toBe(true)
  })
})

describe('external-idps page — search + detail drawer', () => {
  it('filters the table by the search query', async () => {
    providersRef.value = [
      PROVIDER,
      { ...PROVIDER, provider_key: 'globex', display_name: 'Globex SSO' },
    ]
    const wrapper = await mountSuspended(ExternalIdpsPage)
    await wrapper.find('[data-testid="external-idps-search"]').setValue('globex')
    await flushPromises()
    expect(wrapper.find('[data-testid="external-idp-select-globex"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="external-idp-select-acme"]').exists()).toBe(false)
  })
  it('opens the read-only drawer with config + secret-configured status on row select', async () => {
    const wrapper = await mountSuspended(ExternalIdpsPage)
    await wrapper.find('[data-testid="external-idp-select-acme"]').trigger('click')
    await flushPromises()
    const drawer = wrapper.find('[data-testid="external-idp-detail"]')
    expect(drawer.exists()).toBe(true)
    expect(drawer.text()).toContain('sso-client') // client_id
    expect(drawer.text()).toContain('idp.acme.test') // issuer/metadata
    expect(drawer.text()).toContain(enLocale.external_idps.secret_configured)
  })
  it('hides the Add button without the write capability', async () => {
    const wrapper = await mountSuspended(ExternalIdpsPage)
    expect(wrapper.find('[data-testid="external-idps-create"]').exists()).toBe(false)
  })
  it('shows the Add button with the write capability', async () => {
    permitted = ['admin.external-idps.read', 'admin.external-idps.write']
    const wrapper = await mountSuspended(ExternalIdpsPage)
    expect(wrapper.find('[data-testid="external-idps-create"]').exists()).toBe(true)
  })
})
