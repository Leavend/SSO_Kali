import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { LocationQuery, RouteLocationNormalizedLoaded } from 'vue-router'
import { useSessionStore } from '@/stores/session.store'
import ClientsPage from '../ClientsPage.vue'
import { clientsApi } from '../../services/clients.api'
import { useClientsStore } from '../../stores/clients.store'
import { useI18n } from '@/composables/useI18n'
import type { AdminClient } from '../../types'

const routeQuery: LocationQuery = {}
const replaceSpy = vi.fn<(to: { name: string; query?: Record<string, string> }) => void>()

vi.mock('vue-router', () => ({
  useRoute: (): Pick<RouteLocationNormalizedLoaded, 'query'> => ({
    query: routeQuery,
  }),
  useRouter: () => ({
    replace: replaceSpy,
    push: vi.fn<() => void>(),
  }),
}))

vi.mock('../../services/clients.api', () => ({
  clientsApi: {
    list: vi.fn<() => Promise<unknown>>(),
    show: vi.fn<() => Promise<unknown>>(),
    update: vi.fn<() => Promise<unknown>>(),
    create: vi.fn<() => Promise<unknown>>(),
    rotateSecret: vi.fn<() => Promise<unknown>>(),
    contract: vi.fn<() => Promise<unknown>>(),
  },
}))

enableAutoUnmount(afterEach)

const client: AdminClient = {
  client_id: 'prototype-app-a',
  display_name: 'Prototype App A',
  type: 'confidential',
  environment: 'production',
  app_base_url: 'https://app.example.test',
  redirect_uris: ['https://app.example.test/callback'],
  post_logout_redirect_uris: ['https://app.example.test'],
  backchannel_logout_uri: 'https://app.example.test/logout',
  allowed_scopes: ['openid', 'profile'],
  owner_email: 'owner@example.test',
  status: 'active',
  secret_rotated_at: '2026-05-27T00:00:00Z',
  has_secret_hash: true,
}

function seedPrincipal(capabilities: Record<string, boolean>): void {
  useSessionStore().setPrincipal({
    subject_id: 'admin-1',
    email: 'admin@example.test',
    display_name: 'Admin One',
    role: 'admin',
    last_login_at: null,
    auth_context: {
      auth_time: null,
      amr: [],
      acr: null,
      mfa_enforced: false,
      mfa_verified: false,
    },
    permissions: {
      view_admin_panel: true,
      manage_sessions: capabilities['admin.sessions.terminate'] === true,
      capabilities,
      permissions: Object.keys(capabilities),
      menus: [],
    },
  })
}

function seedFullAccessPrincipal(): void {
  seedPrincipal({
    'admin.clients.write': true,
    'admin.sessions.terminate': true,
  })
}

describe('ClientsPage', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await useI18n().setLocale('en')
    delete routeQuery.created
    replaceSpy.mockClear()
    seedFullAccessPrincipal()
  })

  it('renders client detail with separate logout evidence and request context', () => {
    const store = useClientsStore()
    store.clients = [client]
    store.selectedClientId = 'prototype-app-a'
    store.status = 'success'
    store.detailStatus = 'success'
    store.requestId = 'req-clients-1'

    const wrapper = mount(ClientsPage)

    expect(wrapper.text()).toContain('OAuth Clients')
    expect(wrapper.text()).toContain('Prototype App A')
    expect(wrapper.text()).toContain('https://app.example.test/callback')
    expect(wrapper.text()).toContain('https://app.example.test')
    expect(wrapper.text()).toContain('Backchannel logout URI')
    expect(wrapper.text()).toContain('https://app.example.test/logout')
    expect(wrapper.text()).toContain('Reference code')
    expect(wrapper.text()).toContain('REF-CLIENTS1')
    expect(wrapper.text()).not.toContain('req-clients-1')
    expect(wrapper.text()).not.toMatch(/Bearer|refreshToken|secret_hash/i)
  })

  it('marks long client identifiers and URI evidence as mobile breakable', () => {
    const store = useClientsStore()
    store.clients = [client]
    store.selectedClientId = 'prototype-app-a'
    store.status = 'success'
    store.detailStatus = 'success'

    const wrapper = mount(ClientsPage)

    expect(wrapper.get('.client-profile-hero__client-id .stat-value').classes()).toContain(
      'break-anywhere',
    )
    expect(wrapper.get('.client-detail-tabs').classes()).toContain('scroll-edge-indicator')

    const uriCodes = wrapper.findAll('.client-uri-value')
    expect(uriCodes).toHaveLength(3)
    expect(uriCodes.every((code) => code.classes().includes('break-anywhere'))).toBe(true)
  })

  it('uses the last selected client detail tab during rapid clicks', async () => {
    const store = useClientsStore()
    store.clients = [client]
    store.selectedClientId = 'prototype-app-a'
    store.status = 'success'
    store.detailStatus = 'success'

    const wrapper = mount(ClientsPage)
    const tabs = wrapper.findAll('[role="tab"]')
    const overviewTab = tabs.find((tab) => tab.text().includes('Overview'))!
    const lifecycleTab = tabs.find((tab) => tab.text().includes('Lifecycle'))!

    await lifecycleTab.trigger('click')
    await overviewTab.trigger('click')

    expect(overviewTab.attributes('aria-selected')).toBe('true')
    expect(lifecycleTab.attributes('aria-selected')).toBe('false')
    expect(wrapper.find('#client-panel-overview').isVisible()).toBe(true)
  })

  it('renders client type once outside the hero status when the type is unknown', () => {
    const store = useClientsStore()
    store.clients = [
      {
        ...client,
        client_id: 'sso-frontend-portal-with-a-very-long-identifier',
        display_name: 'SSO Frontend Portal With A Very Long Production Name',
        type: null,
        environment: null,
      },
    ]
    store.selectedClientId = 'sso-frontend-portal-with-a-very-long-identifier'
    store.status = 'success'
    store.detailStatus = 'success'

    const wrapper = mount(ClientsPage)

    expect(wrapper.find('.client-profile-hero__header-row h2').classes()).toContain(
      'break-anywhere',
    )
    expect(wrapper.find('.client-profile-hero__type-badge').exists()).toBe(false)
    expect(wrapper.find('.client-profile-hero__status-badge').text()).toBe('active')
    expect(wrapper.find('[data-test="client-overview-type"]').text()).toBe('unknown')
  })

  it('renders active-client URI policy controls with backchannel logout fields', async () => {
    const store = useClientsStore()
    store.clients = [client]
    store.selectedClientId = 'prototype-app-a'
    store.status = 'success'
    store.detailStatus = 'success'

    const wrapper = mount(ClientsPage)

    expect(wrapper.find('textarea[name="redirect_uris"]').exists()).toBe(true)
    expect(wrapper.find('textarea[name="post_logout_redirect_uris"]').exists()).toBe(true)
    expect(wrapper.find('input[name="backchannel_logout_uri"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Simpan URI policy')
  })

  it('updates URI policy with backchannel logout URI through the API', async () => {
    const store = useClientsStore()
    store.clients = [client]
    store.selectedClientId = 'prototype-app-a'
    store.status = 'success'
    store.detailStatus = 'success'
    const updateSpy = vi.spyOn(store, 'updateSelected').mockResolvedValue()

    const wrapper = mount(ClientsPage)

    await wrapper
      .get('textarea[name="redirect_uris"]')
      .setValue('https://app.example.test/new-callback')
    await wrapper
      .get('textarea[name="post_logout_redirect_uris"]')
      .setValue('https://app.example.test')
    await wrapper
      .get('input[name="backchannel_logout_uri"]')
      .setValue('https://app.example.test/new-logout')
    await wrapper.get('form[data-test="uri-policy-form"]').trigger('submit')

    expect(updateSpy).toHaveBeenCalledWith({
      redirect_uris: ['https://app.example.test/new-callback'],
      post_logout_redirect_uris: ['https://app.example.test'],
      backchannel_logout_uri: 'https://app.example.test/new-logout',
    })
  })

  it('blocks invalid and duplicate URI policy values before submitting', async () => {
    const store = useClientsStore()
    store.clients = [client]
    store.selectedClientId = 'prototype-app-a'
    store.status = 'success'
    store.detailStatus = 'success'
    const updateSpy = vi.spyOn(store, 'updateSelected')

    const wrapper = mount(ClientsPage)

    await wrapper.get('textarea[name="redirect_uris"]').setValue('not-a-url\nnot-a-url')
    await wrapper.get('form[data-test="uri-policy-form"]').trigger('submit')

    expect(wrapper.text()).toContain('Redirect URI harus URL valid.')
    expect(wrapper.text()).toContain('Redirect URI tidak boleh duplikat.')
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('renders scope consent controls and parity warnings', async () => {
    const store = useClientsStore()
    store.scopes = [
      { name: 'openid', description: 'OpenID Connect', claims: [], default_allowed: true },
      { name: 'profile', description: 'Profile info', claims: [], default_allowed: true },
      { name: 'email', description: 'Email address', claims: [], default_allowed: true },
    ]
    store.clients = [{ ...client, allowed_scopes: ['openid', 'profile', 'unknown_scope'] }]
    store.selectedClientId = 'prototype-app-a'
    store.status = 'success'
    store.detailStatus = 'success'
    const syncScopesSpy = vi.spyOn(store, 'syncSelectedScopes').mockResolvedValue()

    const wrapper = mount(ClientsPage)
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Scope & consent policy')
    expect(wrapper.text()).toContain('Scope label parity warning')

    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    expect(checkboxes.length).toBeGreaterThanOrEqual(3)

    const openidInput = checkboxes.find((c) => c.attributes('value') === 'openid')
    expect(openidInput?.attributes('disabled')).toBeDefined()

    const emailInput = checkboxes.find((c) => c.attributes('value') === 'email')
    expect(emailInput).toBeDefined()
    await (emailInput as any).setChecked(true)

    await wrapper.get('form[data-test="scope-policy-form"]').trigger('submit')

    expect(syncScopesSpy).toHaveBeenCalled()
    const syncCall = syncScopesSpy.mock.calls[0]![0]
    expect(syncCall).toContain('openid')
    expect(syncCall).toContain('profile')
    expect(syncCall).toContain('unknown_scope')
    expect(syncCall).toContain('email')
  })

  it('triggers hard delete with exact confirmation', async () => {
    const store = useClientsStore()
    store.clients = [client]
    store.selectedClientId = 'prototype-app-a'
    store.status = 'success'
    store.detailStatus = 'success'
    const deleteSpy = vi.spyOn(store, 'deleteSelected').mockResolvedValue()

    const wrapper = mount(ClientsPage)

    await wrapper.get('input[name="delete_confirmation"]').setValue('wrong-confirmation')
    await wrapper.get('button[data-test="delete-client"]').trigger('click')
    expect(deleteSpy).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Type the client ID to confirm permanent deletion.')

    await wrapper.get('input[name="delete_confirmation"]').setValue('prototype-app-a')
    await wrapper.get('button[data-test="delete-client"]').trigger('click')
    expect(deleteSpy).toHaveBeenCalled()
  })

  it('renders destructive client lifecycle controls behind confirmation text', async () => {
    const store = useClientsStore()
    store.clients = [client]
    store.selectedClientId = 'prototype-app-a'
    store.status = 'success'
    store.detailStatus = 'success'
    const disableSpy = vi.spyOn(store, 'disableSelected').mockResolvedValue()
    const decommissionSpy = vi.spyOn(store, 'decommissionSelected').mockResolvedValue()

    const wrapper = mount(ClientsPage)

    expect(wrapper.text()).toContain('Client lifecycle')
    expect(wrapper.text()).toContain('Impact summary')
    expect(wrapper.text()).toContain('Permanently delete client')

    await wrapper.get('textarea[name="client_disable_reason"]').setValue('incident response')
    await wrapper.get('button[data-test="disable-client"]').trigger('click')

    expect(disableSpy).toHaveBeenCalledWith({ reason: 'incident response' })

    await wrapper.get('input[name="decommission_confirmation"]').setValue('prototype-app-a')
    await wrapper.get('button[data-test="decommission-client"]').trigger('click')

    expect(decommissionSpy).toHaveBeenCalled()
  })

  it('blocks decommission without exact client confirmation', async () => {
    const store = useClientsStore()
    store.clients = [client]
    store.selectedClientId = 'prototype-app-a'
    store.status = 'success'
    store.detailStatus = 'success'
    const decommissionSpy = vi.spyOn(store, 'decommissionSelected')

    const wrapper = mount(ClientsPage)

    await wrapper.get('input[name="decommission_confirmation"]').setValue('wrong-client')
    await wrapper.get('button[data-test="decommission-client"]').trigger('click')

    expect(wrapper.text()).toContain('Ketik client ID untuk konfirmasi decommission.')
    expect(decommissionSpy).not.toHaveBeenCalled()
  })

  it('renders safe forbidden state', () => {
    const store = useClientsStore()
    store.status = 'forbidden'
    store.errorMessage = 'Kamu tidak memiliki izin untuk melihat OAuth clients.'

    const wrapper = mount(ClientsPage)

    expect(wrapper.text()).toContain('OAuth clients access denied')
    expect(wrapper.text()).not.toContain('SQLSTATE')
  })

  it('renders one-time rotated secret and clears it', async () => {
    const store = useClientsStore()
    store.status = 'success'
    store.clients = [client]
    store.selectedClientId = 'prototype-app-a'
    store.rotationClientId = 'prototype-app-a'
    store.rotationSecret = 'once-secret'

    const wrapper = mount(ClientsPage)

    expect(wrapper.text()).toContain('once-secret')

    await wrapper.get('button[data-test="clear-rotation-secret"]').trigger('click')

    expect(store.rotationSecret).toBeNull()
    expect(wrapper.text()).not.toContain('once-secret')
  })

  it('previews the integration contract with the selected client real category', async () => {
    const store = useClientsStore()
    const staffClient: AdminClient = {
      ...client,
      client_id: 'staff-portal',
      category: 'kepegawaian',
    }
    store.status = 'success'
    store.detailStatus = 'success'
    store.clients = [staffClient]
    store.selectedClientId = 'staff-portal'

    vi.spyOn(store, 'rotateSelectedSecret').mockResolvedValue(undefined)
    const contractSpy = vi
      .mocked(clientsApi.contract)
      .mockResolvedValue({ contract: { env: ['SSO_ISSUER=x'], issuer: 'x' } })

    const wrapper = mount(ClientsPage)
    await wrapper.get('[data-test="rotate-secret"]').trigger('click')
    await flushPromises()

    expect(contractSpy).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'kepegawaian' }),
    )
  })

  it('reveals created client modal from query intent and clears query on close', async () => {
    const store = useClientsStore()
    store.clients = [client]
    store.selectedClientId = 'prototype-app-a'
    store.status = 'success'
    store.detailStatus = 'success'
    store.setCreatedClientIntent({
      clientId: 'prototype-app-a',
      type: 'confidential',
      plaintextSecret: 'secret-once',
      envSnippet: 'SSO_CLIENT_ID=prototype-app-a',
    })
    routeQuery.created = 'prototype-app-a'

    const wrapper = mount(ClientsPage)
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Confidential client created')
    expect(wrapper.text()).toContain('secret-once')
    expect(wrapper.text()).toContain('SSO_CLIENT_ID=prototype-app-a')

    await wrapper.get('[data-testid="close-created-client-dialog"]').trigger('click')

    expect(replaceSpy).toHaveBeenCalledWith({ name: 'admin.clients', query: {} })
  })

  it('renders empty state when no clients are available', () => {
    const store = useClientsStore()
    store.status = 'success'
    store.clients = []
    store.selectedClientId = null

    const wrapper = mount(ClientsPage)

    expect(wrapper.text()).toContain('No OAuth clients to display.')
    expect(wrapper.find('.ui-empty-state').exists()).toBe(true)
  })

  it('uses shared loading, status, data, and form primitives', async () => {
    const store = useClientsStore()
    store.status = 'loading'

    const wrapper = mount(ClientsPage)

    expect(wrapper.find('.ui-skeleton').exists()).toBe(true)

    store.status = 'forbidden'
    store.errorMessage = 'Kamu tidak memiliki izin untuk melihat OAuth clients.'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.ui-status-view').exists()).toBe(true)

    store.status = 'success'
    store.clients = [client]
    store.selectedClientId = 'prototype-app-a'
    await wrapper.vm.$nextTick()
    // The searchable client list uses shared form primitives for filtering.
    expect(wrapper.find('input#search-clients').exists()).toBe(true)
    expect(wrapper.find('.ui-form-field').exists()).toBe(true)
    expect(wrapper.find('.ui-control').exists()).toBe(true)
  })

  it('hides client write and lifecycle actions for read-only principals', () => {
    seedPrincipal({})
    const store = useClientsStore()
    store.clients = [client]
    store.selectedClientId = 'prototype-app-a'
    store.status = 'success'
    store.detailStatus = 'success'

    const wrapper = mount(ClientsPage)

    expect(wrapper.text()).not.toContain('Create OAuth client')
    expect(wrapper.text()).not.toContain('Simpan URI policy')
    expect(wrapper.text()).not.toContain('Simpan scope policy')
    expect(wrapper.text()).not.toContain('Simpan metadata')
    expect(wrapper.text()).not.toContain('Disable client')
    expect(wrapper.text()).not.toContain('Decommission client')
    expect(wrapper.text()).not.toContain('Rotate secret')
  })

  it('requires session termination permission for client lifecycle actions', () => {
    seedPrincipal({ 'admin.clients.write': true })
    const store = useClientsStore()
    store.clients = [client]
    store.selectedClientId = 'prototype-app-a'
    store.status = 'success'
    store.detailStatus = 'success'

    const wrapper = mount(ClientsPage)

    expect(wrapper.text()).toContain('Create client')
    expect(wrapper.text()).toContain('Rotate secret')
    expect(wrapper.text()).not.toContain('Disable client')
    expect(wrapper.text()).not.toContain('Decommission client')
  })

  it('renders selectable client rows in the master list (.tbl)', () => {
    const store = useClientsStore()
    store.status = 'success'
    store.clients = [client]
    store.selectedClientId = 'prototype-app-a'

    const wrapper = mount(ClientsPage)

    // The master list is a token-styled .tbl; each client is a selectable row.
    expect(wrapper.find('.clients-master table.tbl').exists()).toBe(true)
    const rows = wrapper.findAll('tr.client-card-item')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.text()).toContain('Prototype App A')
    expect(rows[0]!.attributes('aria-current')).toBe('true')
    expect(rows[0]!.attributes('aria-selected')).toBe('true')
    expect(rows[0]!.attributes('tabindex')).toBe('0')
  })

  it('selecting a master row loads that client into the detail panel', async () => {
    const second: AdminClient = {
      ...client,
      client_id: 'prototype-app-b',
      display_name: 'Prototype App B',
    }
    const store = useClientsStore()
    store.status = 'success'
    store.detailStatus = 'success'
    store.clients = [client, second]
    store.selectedClientId = 'prototype-app-a'
    // selectClient delegates to the API show() path; stub it so no refetch noise.
    const selectSpy = vi.spyOn(store, 'selectClient').mockImplementation(async (id: string) => {
      store.selectedClientId = id
    })

    const wrapper = mount(ClientsPage)
    expect(wrapper.find('.client-profile-hero__header-row h2').text()).toContain('Prototype App A')

    const rows = wrapper.findAll('tr.client-card-item')
    const rowB = rows.find((row) => row.text().includes('Prototype App B'))!
    await rowB.trigger('click')
    await wrapper.vm.$nextTick()

    expect(selectSpy).toHaveBeenCalledWith('prototype-app-b')
    expect(wrapper.find('.client-profile-hero__header-row h2').text()).toContain('Prototype App B')
  })

  it('exposes the client status and category as non-colour-only badges in the detail hero', () => {
    const store = useClientsStore()
    store.status = 'success'
    store.detailStatus = 'success'
    store.clients = [{ ...client, category: 'kepegawaian' }]
    store.selectedClientId = 'prototype-app-a'

    const wrapper = mount(ClientsPage)

    // Status + category render via the shared UiStatusBadge (.status dot + label).
    const statusBadge = wrapper.find('.client-profile-hero__status-badge')
    expect(statusBadge.classes()).toContain('status')
    expect(statusBadge.text()).toBe('active')
    const categoryBadge = wrapper.find('.client-profile-hero__category-badge')
    expect(categoryBadge.classes()).toContain('status')
    expect(categoryBadge.text()).toContain('Staff')
  })

  it('moves between detail tabs with arrow keys (tablist semantics)', async () => {
    const store = useClientsStore()
    store.status = 'success'
    store.detailStatus = 'success'
    store.clients = [client]
    store.selectedClientId = 'prototype-app-a'

    const wrapper = mount(ClientsPage)
    const tabs = wrapper.findAll('[role="tab"]')
    const overviewTab = tabs.find((tab) => tab.text().includes('Overview'))!
    const urisTab = tabs.find((tab) => tab.text().includes('URIs'))!

    expect(overviewTab.attributes('aria-selected')).toBe('true')
    expect(overviewTab.attributes('tabindex')).toBe('0')
    expect(urisTab.attributes('tabindex')).toBe('-1')

    await overviewTab.trigger('keydown', { key: 'ArrowRight' })

    expect(urisTab.attributes('aria-selected')).toBe('true')
    expect(overviewTab.attributes('aria-selected')).toBe('false')
    expect(wrapper.find('#client-panel-uris').isVisible()).toBe(true)
  })

  it('hosts the detail panel in a focus-trapping drawer at ≤920px', async () => {
    const originalMatchMedia = window.matchMedia
    // Force the compact breakpoint: the inline pane collapses to a drawer.
    window.matchMedia = vi
      .fn<(query: string) => MediaQueryList>()
      .mockImplementation(
        (query: string) =>
          ({
            matches: query.includes('max-width: 920px'),
            media: query,
            onchange: null,
            addEventListener: vi.fn<() => void>(),
            removeEventListener: vi.fn<() => void>(),
            addListener: vi.fn<() => void>(),
            removeListener: vi.fn<() => void>(),
            dispatchEvent: vi.fn<() => boolean>(),
          }) as unknown as MediaQueryList,
      ) as unknown as typeof window.matchMedia

    try {
      const store = useClientsStore()
      store.status = 'success'
      store.detailStatus = 'success'
      store.clients = [client]
      store.selectedClientId = 'prototype-app-a'

      const wrapper = mount(ClientsPage, { attachTo: document.body })
      await wrapper.vm.$nextTick()

      const drawer = document.querySelector('[role="dialog"][aria-modal="true"]')
      expect(drawer).not.toBeNull()
      // Detail content (and its tabs) renders inside the drawer, not inline.
      expect(drawer!.querySelector('[role="tablist"]')).not.toBeNull()
      expect(drawer!.textContent).toContain('Prototype App A')

      wrapper.unmount()
    } finally {
      window.matchMedia = originalMatchMedia
    }
  })
})
