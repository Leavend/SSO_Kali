import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionStore } from '@/stores/session.store'
import ClientsPage from '../ClientsPage.vue'
import { useClientsStore } from '../../stores/clients.store'
import { useI18n } from '@/composables/useI18n'
import type { AdminClient } from '../../types'

vi.mock('../../services/clients.api', () => ({
  clientsApi: {
    list: vi.fn<() => Promise<unknown>>(),
    show: vi.fn<() => Promise<unknown>>(),
    update: vi.fn<() => Promise<unknown>>(),
    create: vi.fn<() => Promise<unknown>>(),
    rotateSecret: vi.fn<() => Promise<unknown>>(),
  },
}))

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
  beforeEach(() => {
    setActivePinia(createPinia())
    useI18n().setLocale('en')
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
    expect(wrapper.text()).toContain('Kode referensi')
    expect(wrapper.text()).toContain('REF-CLIENTS1')
    expect(wrapper.text()).not.toContain('req-clients-1')
    expect(wrapper.text()).not.toMatch(/Bearer|refreshToken|secret_hash/i)
  })

  it('renders active-client create and URI policy controls with backchannel logout fields', async () => {
    const store = useClientsStore()
    store.clients = [client]
    store.selectedClientId = 'prototype-app-a'
    store.status = 'success'
    store.detailStatus = 'success'

    const wrapper = mount(ClientsPage)

    await wrapper.get('button.create-client-toggle').trigger('click')
    expect(wrapper.text()).toContain('Create OAuth client')
    expect(wrapper.find('input[name="create_redirect_uri"]').exists()).toBe(true)
    expect(wrapper.find('input[name="create_backchannel_logout_uri"]').exists()).toBe(true)
    expect(wrapper.find('textarea[name="redirect_uris"]').exists()).toBe(true)
    expect(wrapper.find('textarea[name="post_logout_redirect_uris"]').exists()).toBe(true)
    expect(wrapper.find('input[name="backchannel_logout_uri"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Simpan URI policy')
  })

  it('submits client creation as an active integration request', async () => {
    const store = useClientsStore()
    store.clients = [client]
    store.selectedClientId = 'prototype-app-a'
    store.status = 'success'
    store.detailStatus = 'success'
    const createdClient = {
      ...client,
      client_id: 'prototype-app-b',
      display_name: 'Prototype App B',
      type: 'public',
      status: 'active',
      has_secret_hash: false,
    }
    const createSpy = vi
      .spyOn(store, 'createClient')
      .mockResolvedValue({ registration: createdClient })

    const wrapper = mount(ClientsPage)

    await wrapper.get('button.create-client-toggle').trigger('click')
    await wrapper.get('input[name="client_id"]').setValue('prototype-app-b')
    await wrapper.get('input[name="create_display_name"]').setValue('Prototype App B')
    await wrapper.get('input[name="create_owner_email"]').setValue('owner@example.test')
    await wrapper
      .get('input[name="create_redirect_uri"]')
      .setValue('https://app-b.example.test/callback')
    await wrapper
      .get('input[name="create_backchannel_logout_uri"]')
      .setValue('https://app-b.example.test/auth/backchannel/logout')
    await wrapper.get('[data-testid="create-client-form"]').trigger('submit')

    expect(createSpy).toHaveBeenCalledWith({
      app_name: 'Prototype App B',
      client_id: 'prototype-app-b',
      environment: 'development',
      client_type: 'public',
      app_base_url: 'https://app-b.example.test',
      callback_path: '/callback',
      logout_path: '/auth/backchannel/logout',
      owner_email: 'owner@example.test',
      provisioning: 'jit',
      allowed_scopes: ['openid', 'profile', 'email'],
    })
    expect(wrapper.text()).toContain('Public client created')
    expect(wrapper.text()).toContain('SSO_CLIENT_ID=prototype-app-b')
    expect(wrapper.text()).not.toContain('SSO_CLIENT_SECRET')
  })

  it('shows a create-specific success step with the confidential secret once', async () => {
    useI18n().setLocale('id')
    const store = useClientsStore()
    store.clients = [client]
    store.selectedClientId = 'prototype-app-a'
    store.status = 'success'
    store.detailStatus = 'success'
    vi.spyOn(store, 'createClient').mockResolvedValue({
      registration: {
        ...client,
        client_id: 'server-app',
        display_name: 'Server App',
        status: 'active',
        has_secret_hash: true,
      },
      plaintext_secret: 'created-secret-once',
    })

    const wrapper = mount(ClientsPage)
    await wrapper.get('button.create-client-toggle').trigger('click')
    await wrapper.get('input[name="client_id"]').setValue('server-app')
    await wrapper.get('input[name="create_display_name"]').setValue('Server App')
    await wrapper.get('input[name="create_owner_email"]').setValue('owner@example.test')
    await wrapper.get('select[name="client_type"]').setValue('confidential')
    await wrapper
      .get('input[name="create_redirect_uri"]')
      .setValue('https://server.example.test/auth/callback')
    await wrapper
      .get('input[name="create_backchannel_logout_uri"]')
      .setValue('https://server.example.test/auth/backchannel/logout')
    await wrapper.get('[data-testid="create-client-form"]').trigger('submit')

    expect(wrapper.text()).toContain('Client confidential berhasil dibuat')
    expect(wrapper.text()).toContain('created-secret-once')
    expect(wrapper.text()).toContain('hanya ditampilkan sekali')
    expect(wrapper.text()).toContain('SSO_CLIENT_ID=server-app')
    expect(wrapper.text()).toContain('SSO_CLIENT_SECRET=created-secret-once')
    expect(wrapper.text()).not.toContain('Secret baru untuk')

    await wrapper.get('[data-testid="close-client-create-result"]').trigger('click')
    expect(wrapper.text()).not.toContain('created-secret-once')
  })

  it('disables client creation and renders inline validation for invalid fields', async () => {
    useI18n().setLocale('id')
    const store = useClientsStore()
    store.clients = [client]
    store.selectedClientId = client.client_id
    store.status = 'success'
    const createSpy = vi.spyOn(store, 'createClient')

    const wrapper = mount(ClientsPage)
    await wrapper.get('button.create-client-toggle').trigger('click')
    await wrapper.get('input[name="client_id"]').setValue('INVALID ID')
    await wrapper.get('input[name="create_display_name"]').setValue('Invalid App')
    await wrapper.get('input[name="create_owner_email"]').setValue('not-an-email')
    await wrapper.get('input[name="create_redirect_uri"]').setValue('not-a-url')

    expect(wrapper.text()).toContain('Client ID harus berupa slug')
    expect(wrapper.text()).toContain('Email pemilik tidak valid')
    expect(wrapper.text()).toContain('Redirect URI harus berupa URL')
    expect(wrapper.get('[data-testid="create-client-submit"]').attributes('disabled')).toBeDefined()
    expect(createSpy).not.toHaveBeenCalled()
  })

  it('blocks client creation when redirect and logout origins differ', async () => {
    useI18n().setLocale('id')
    const store = useClientsStore()
    store.clients = [client]
    store.selectedClientId = 'prototype-app-a'
    store.status = 'success'
    store.detailStatus = 'success'
    const createSpy = vi.spyOn(store, 'createClient')

    const wrapper = mount(ClientsPage)

    await wrapper.get('button.create-client-toggle').trigger('click')
    await wrapper.get('input[name="client_id"]').setValue('prototype-app-b')
    await wrapper.get('input[name="create_display_name"]').setValue('Prototype App B')
    await wrapper.get('input[name="create_owner_email"]').setValue('owner@example.test')
    await wrapper
      .get('input[name="create_redirect_uri"]')
      .setValue('https://app-b.example.test/callback')
    await wrapper
      .get('input[name="create_backchannel_logout_uri"]')
      .setValue('https://logout.example.test/auth/backchannel/logout')
    await wrapper.get('[data-testid="create-client-form"]').trigger('submit')

    expect(wrapper.text()).toContain(
      'Logout URL harus valid dan memakai origin yang sama dengan Redirect URI.',
    )
    expect(createSpy).not.toHaveBeenCalled()
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
    store.clients = [{ ...client, allowed_scopes: ['openid', 'profile', 'unknown_scope'] }]
    store.selectedClientId = 'prototype-app-a'
    store.status = 'success'
    store.detailStatus = 'success'
    const syncScopesSpy = vi.spyOn(store, 'syncSelectedScopes').mockResolvedValue()

    const wrapper = mount(ClientsPage)

    expect(wrapper.text()).toContain('Scope & consent policy')
    expect(wrapper.text()).toContain('Scope label parity warning')
    expect(wrapper.find('textarea[name="allowed_scopes"]').exists()).toBe(true)

    await wrapper.get('textarea[name="allowed_scopes"]').setValue('openid\nprofile\nemail')
    await wrapper.get('form[data-test="scope-policy-form"]').trigger('submit')

    expect(syncScopesSpy).toHaveBeenCalledWith(['openid', 'profile', 'email'])
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

  it('renders selectable client cards in the sidebar list', () => {
    const store = useClientsStore()
    store.status = 'success'
    store.clients = [client]
    store.selectedClientId = 'prototype-app-a'

    const wrapper = mount(ClientsPage)

    const cards = wrapper.findAll('button.client-card-item')
    expect(cards).toHaveLength(1)
    expect(cards[0]!.text()).toContain('Prototype App A')
    expect(cards[0]!.attributes('aria-current')).toBe('true')
  })
})
