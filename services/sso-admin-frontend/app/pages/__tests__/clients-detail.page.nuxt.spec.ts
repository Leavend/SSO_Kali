// *.nuxt.spec.ts → 'nuxt' env: mountSuspended drives the page's async setup
// (useRoute + useI18n + definePageMeta auto-imports). Data boundary + scope
// catalog + session store are mocked so each ClientDetailViewState is deterministic.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import ClientMetadataForm from '@/components/clients/ClientMetadataForm.vue'
import ClientUriPolicyForm from '@/components/clients/ClientUriPolicyForm.vue'
import ClientScopePolicyForm from '@/components/clients/ClientScopePolicyForm.vue'
import ClientSecretRotation from '@/components/clients/ClientSecretRotation.vue'
import type { AdminClientDetail, ScopeCatalogEntry } from '@/types/clients.types'
import type { ClientDetailViewState } from '@/lib/clients/clients-view-state'

const client = ref<AdminClientDetail | null>(null)
const viewState = ref<ClientDetailViewState>('loading')
const requestId = ref<string | null>(null)
const scopes = ref<readonly ScopeCatalogEntry[]>([])
const refreshMock = vi.fn<() => Promise<void>>(async () => {})

// navigateTo is a Nuxt auto-import; the page calls it after a successful delete
// (onDeleted → list) and from onBack. mockNuxtImport hoists above the module body,
// so the spy must be created in vi.hoisted to exist when the mock factory runs.
const { navigateToMock } = vi.hoisted(() => ({
  navigateToMock: vi.fn<(...args: unknown[]) => Promise<void> | void>(),
}))
mockNuxtImport('navigateTo', () => navigateToMock)

// ponytail: pin locale to 'en' so assertions use literal English strings.
// Default locale is 'id'; without this mock the spec would assert Indonesian.
vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const parts = key.split('.')
      let val: unknown = enLocale
      for (const part of parts) {
        val = (val as Record<string, unknown>)?.[part]
      }
      if (typeof val !== 'string') return key
      if (!params) return val
      return val.replace(/\{(\w+)\}/gu, (_: string, k: string) => String(params[k] ?? ''))
    },
  }),
}))

vi.mock('@/composables/useClientDetail', () => ({
  useClientDetail: () => ({ client, viewState, requestId, refresh: refreshMock }),
}))

vi.mock('@/composables/useScopeCatalog', () => ({
  useScopeCatalog: () => ({ scopes, pending: computed(() => false), error: computed(() => null) }),
}))

// Permission-aware session double: the write forms (Task 5.11) mount only under
// admin.clients.write, so the mock reads a mutable allow-list per test.
let permitted: string[] = []
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { display_name: 'Admin Sentinel' },
    hasPermission: (p: string) => permitted.includes(p),
  }),
}))

// The list/detail DTOs carry only has_secret_hash — never a secret. This sentinel
// MUST NOT appear anywhere in the rendered tree or hydrated payload.
const SECRET_CANARY = 'cs_PLAINTEXT_DO_NOT_LEAK_abcdef0123456789'

const READY_CLIENT: AdminClientDetail = {
  client_id: 'selamat-kerja',
  display_name: 'Selamat Kerja',
  type: 'confidential',
  environment: 'live',
  app_base_url: 'https://selamat-kerja.timeh.my.id',
  redirect_uris: ['https://selamat-kerja.timeh.my.id/auth/callback'],
  post_logout_redirect_uris: ['https://selamat-kerja.timeh.my.id/auth/logout'],
  allowed_scopes: ['openid', 'profile', 'email', 'kepegawaian.read'],
  backchannel_logout_uri: 'https://selamat-kerja.timeh.my.id/auth/backchannel/logout',
  backchannel_logout_internal: false,
  owner_email: 'ops@selamat-kerja.example',
  provisioning: 'jit',
  status: 'active',
  category: 'kepegawaian',
  has_secret_hash: true,
  activated_at: '2026-06-20T10:00:00Z',
  disabled_at: null,
  secret_rotated_at: '2026-06-25T08:00:00Z',
  secret_expires_at: '2026-12-25T08:00:00Z',
}

const CATALOG: readonly ScopeCatalogEntry[] = [
  { name: 'openid', description: 'OpenID', claims: ['sub'], default_allowed: true },
  { name: 'profile', description: 'Profile', claims: ['name'], default_allowed: true },
  { name: 'email', description: 'Email', claims: ['email'], default_allowed: true },
  // 'kepegawaian.read' is intentionally absent → drives the scope-parity warning.
]

const ClientDetail = (await import('../clients/[clientId].vue')).default

beforeEach(() => {
  client.value = null
  viewState.value = 'loading'
  requestId.value = null
  scopes.value = []
  // Default: full clients access so the read-surface tests render as before; the
  // write-form tests narrow this per-case.
  permitted = ['admin.clients.read', 'admin.clients.write']
  vi.clearAllMocks()
})
afterEach(() => vi.clearAllMocks())

describe('client detail page', () => {
  it('always renders the masked principal + public client id in the hero, no token/secret', async () => {
    client.value = READY_CLIENT
    viewState.value = 'ready'
    const wrapper = await mountSuspended(ClientDetail)
    const principal = wrapper.find('[data-principal-name]')
    expect(principal.exists()).toBe(true)
    expect(principal.text()).toContain('Admin Sentinel')
    expect(wrapper.find('[data-page="client-detail"]').exists()).toBe(true)
    // client_id is a PUBLIC identifier — it renders (folio); no secret/token does.
    expect(wrapper.text()).toContain('selamat-kerja')
    const html = wrapper.html()
    expect(html).not.toMatch(/access_token|refresh_token|id_token|Bearer/)
    expect(html).not.toMatch(/client_secret|clientSecret/i)
    expect(html).not.toContain(SECRET_CANARY)
  })

  it('loading → skeleton, no overview panel', async () => {
    viewState.value = 'loading'
    const wrapper = await mountSuspended(ClientDetail)
    expect(wrapper.findComponent(UiSkeleton).exists()).toBe(true)
    expect(wrapper.find('[data-panel="overview"]').exists()).toBe(false)
  })

  it('forbidden → forbidden status view (no-permission), distinct from not_found', async () => {
    viewState.value = 'forbidden'
    requestId.value = 'admin-req-DENIED42'
    const wrapper = await mountSuspended(ClientDetail)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('forbidden')
    expect(wrapper.findComponent(UiEmptyState).exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/SQLSTATE|stack trace|Bearer/i)
  })

  it('unauthenticated → step_up status view', async () => {
    viewState.value = 'unauthenticated'
    const wrapper = await mountSuspended(ClientDetail)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('step_up')
  })

  it('not_found → dedicated empty surface, not a status view', async () => {
    viewState.value = 'not_found'
    const wrapper = await mountSuspended(ClientDetail)
    expect(wrapper.findComponent(UiEmptyState).exists()).toBe(true)
    expect(wrapper.findComponent(UiStatusView).exists()).toBe(false)
    expect(wrapper.text()).toContain('Client not found')
  })

  it('error → error status view; raw request id is redacted to REF-XXXXXXXX', async () => {
    viewState.value = 'error'
    requestId.value = 'admin-req-FAILED99'
    const wrapper = await mountSuspended(ClientDetail)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('error')
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('admin-req-FAILED99')
  })

  it('ready → overview panel: type/owner + status & category badges (never colour-alone)', async () => {
    viewState.value = 'ready'
    client.value = READY_CLIENT
    const wrapper = await mountSuspended(ClientDetail)
    const overview = wrapper.find('[data-panel="overview"]')
    expect(overview.exists()).toBe(true)
    expect(overview.text()).toContain('confidential')
    expect(overview.text()).toContain('ops@selamat-kerja.example')
    const tones = wrapper.findAllComponents(UiStatusBadge).map((b) => b.props('tone'))
    expect(tones).toContain('success') // active status → success
    expect(tones).toContain('brand') // kepegawaian category → brand
  })

  it('ready → URIs panel lists redirect/post-logout/backchannel', async () => {
    viewState.value = 'ready'
    client.value = READY_CLIENT
    const wrapper = await mountSuspended(ClientDetail)
    const uris = wrapper.find('[data-panel="uris"]')
    expect(uris.exists()).toBe(true)
    expect(uris.text()).toContain('https://selamat-kerja.timeh.my.id/auth/callback')
    expect(uris.text()).toContain('https://selamat-kerja.timeh.my.id/auth/logout')
    expect(uris.text()).toContain('https://selamat-kerja.timeh.my.id/auth/backchannel/logout')
  })

  it('ready → scopes panel renders badges + a parity warning for catalog-absent scopes', async () => {
    viewState.value = 'ready'
    client.value = READY_CLIENT
    scopes.value = CATALOG
    const wrapper = await mountSuspended(ClientDetail)
    const scopesPanel = wrapper.find('[data-panel="scopes"]')
    expect(scopesPanel.exists()).toBe(true)
    expect(scopesPanel.text()).toContain('openid')
    expect(scopesPanel.text()).toContain('kepegawaian.read')
    // The custom scope is absent from the catalog → parity warning banner shows.
    expect(scopesPanel.find('[role="alert"]').exists()).toBe(true)
    expect(scopesPanel.text()).toContain('kepegawaian.read')
  })

  it('ready → security panel shows has_secret_hash boolean only, NEVER the secret', async () => {
    viewState.value = 'ready'
    client.value = READY_CLIENT
    const wrapper = await mountSuspended(ClientDetail)
    const security = wrapper.find('[data-panel="security"]')
    expect(security.exists()).toBe(true)
    expect(security.text()).toContain('Stored') // has_secret_hash:true → val_stored
    const html = wrapper.html()
    expect(html).not.toMatch(/client_secret|clientSecret/i)
    expect(html).not.toContain(SECRET_CANARY)
  })

  it('ready → security panel shows "not available" when has_secret_hash is falsy', async () => {
    viewState.value = 'ready'
    client.value = { ...READY_CLIENT, has_secret_hash: false }
    const wrapper = await mountSuspended(ClientDetail)
    expect(wrapper.find('[data-panel="security"]').text()).toContain('Not available')
  })

  it('ready → lifecycle panel surfaces activation/secret-expiry/provisioning', async () => {
    viewState.value = 'ready'
    client.value = READY_CLIENT
    const wrapper = await mountSuspended(ClientDetail)
    const lifecycle = wrapper.find('[data-panel="lifecycle"]')
    expect(lifecycle.exists()).toBe(true)
    expect(lifecycle.text()).toContain('jit') // provisioning
  })

  it('ready → consent-trail + secret-rotation control; dual-gate hides lifecycle buttons without sessions.terminate', async () => {
    // read+write but NOT sessions.terminate (default beforeEach perms): the
    // dual-permission gate fails closed, so no destructive lifecycle button shows.
    viewState.value = 'ready'
    client.value = READY_CLIENT
    const wrapper = await mountSuspended(ClientDetail)
    expect(wrapper.find('[data-consent-trail]').exists()).toBe(true)
    // Task 5.12 lands the destructive secret-rotation control in the security tab.
    expect(wrapper.findComponent(ClientSecretRotation).exists()).toBe(true)
    expect(wrapper.find('[data-action="rotate-secret"]').exists()).toBe(true)
    // No lifecycle destructive controls without the second permission. Descriptive
    // evidence copy like "Disabled" in dt/dd labels is not a control.
    const controls = [...wrapper.findAll('button'), ...wrapper.findAll('a')].map((el) => el.text())
    for (const label of controls) {
      expect(label).not.toMatch(/disable|decommission|delete/i)
    }
  })

  it('never serializes a client secret value or field name into the SSR HTML', async () => {
    viewState.value = 'ready'
    client.value = READY_CLIENT
    const html = (await mountSuspended(ClientDetail)).html()
    expect(html).not.toMatch(/client_secret|clientSecret/i)
    expect(html).not.toContain(SECRET_CANARY)
    expect(html).not.toMatch(/access_token|refresh_token|id_token|Bearer/)
  })
})

describe('clients detail page — write forms (Task 5.11)', () => {
  it('mounts the three edit forms when the operator may write', async () => {
    permitted = ['admin.clients.read', 'admin.clients.write']
    viewState.value = 'ready'
    client.value = READY_CLIENT
    scopes.value = CATALOG
    const page = await mountSuspended(ClientDetail)
    expect(page.findComponent(ClientMetadataForm).exists()).toBe(true)
    expect(page.findComponent(ClientUriPolicyForm).exists()).toBe(true)
    expect(page.findComponent(ClientScopePolicyForm).exists()).toBe(true)
  })

  it('hides the edit forms for a read-only operator', async () => {
    permitted = ['admin.clients.read']
    viewState.value = 'ready'
    client.value = READY_CLIENT
    const page = await mountSuspended(ClientDetail)
    expect(page.findComponent(ClientMetadataForm).exists()).toBe(false)
    expect(page.findComponent(ClientUriPolicyForm).exists()).toBe(false)
    expect(page.findComponent(ClientScopePolicyForm).exists()).toBe(false)
  })

  it('refreshes detail when a form emits done', async () => {
    permitted = ['admin.clients.read', 'admin.clients.write']
    viewState.value = 'ready'
    client.value = READY_CLIENT
    const page = await mountSuspended(ClientDetail)
    refreshMock.mockClear()
    page.findComponent(ClientMetadataForm).vm.$emit('done')
    await nextTick()
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('never serialises a client secret or token field into the SSR HTML with forms mounted', async () => {
    permitted = ['admin.clients.read', 'admin.clients.write']
    viewState.value = 'ready'
    client.value = READY_CLIENT
    scopes.value = CATALOG
    const html = (await mountSuspended(ClientDetail)).html()
    expect(html).not.toMatch(/client_secret|clientSecret|access_token|accessToken|refresh_token/i)
    expect(html).not.toContain(SECRET_CANARY)
    // client_id is a public identifier and IS allowed to appear.
    expect(html).toContain('selamat-kerja')
  })
})

describe('clients detail page — lifecycle actions (Task 5.13)', () => {
  // Nuxt auto-registers the SFC under its path-prefixed name
  // (components dir: clients/ClientLifecycleActions.vue → ClientsClientLifecycleActions).
  const LIFECYCLE = 'ClientsClientLifecycleActions'

  it('mounts the lifecycle actions and refreshes detail after a successful action', async () => {
    permitted = ['admin.clients.read', 'admin.clients.write', 'admin.sessions.terminate']
    viewState.value = 'ready'
    client.value = READY_CLIENT
    const wrapper = await mountSuspended(ClientDetail)
    const actions = wrapper.findComponent({ name: LIFECYCLE })
    expect(actions.exists()).toBe(true)
    refreshMock.mockClear()
    actions.vm.$emit('done')
    await nextTick()
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('navigates back to the clients list after a successful delete', async () => {
    permitted = ['admin.clients.read', 'admin.clients.write', 'admin.sessions.terminate']
    viewState.value = 'ready'
    client.value = READY_CLIENT
    const wrapper = await mountSuspended(ClientDetail)
    navigateToMock.mockClear()
    wrapper.findComponent({ name: LIFECYCLE }).vm.$emit('deleted')
    await nextTick()
    expect(navigateToMock).toHaveBeenCalledWith({ name: 'admin.clients' })
  })

  it('never serializes a client_secret into the SSR HTML with the lifecycle surface mounted', async () => {
    permitted = ['admin.clients.read', 'admin.clients.write', 'admin.sessions.terminate']
    viewState.value = 'ready'
    client.value = READY_CLIENT
    const html = (await mountSuspended(ClientDetail)).html()
    expect(html).not.toMatch(/client_secret|clientSecret/i)
    expect(html).not.toContain(SECRET_CANARY)
  })
})
