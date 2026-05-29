import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ClientsPage from '../ClientsPage.vue'
import { useClientsStore } from '../../stores/clients.store'
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
  post_logout_redirect_uris: ['https://app.example.test/logout'],
  allowed_scopes: ['openid', 'profile'],
  owner_email: 'owner@example.test',
  status: 'active',
  secret_rotated_at: '2026-05-27T00:00:00Z',
  has_secret_hash: true,
}

describe('ClientsPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders client list, detail, redirect URIs, and request evidence', () => {
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
    expect(wrapper.text()).toContain('owner@example.test')
    expect(wrapper.text()).toContain('Request ID')
    expect(wrapper.text()).toContain('req-clients-1')
    expect(wrapper.text()).not.toMatch(/Bearer|refreshToken|secret_hash/i)
  })

  it('renders client create and URI edit controls', () => {
    const store = useClientsStore()
    store.clients = [client]
    store.selectedClientId = 'prototype-app-a'
    store.status = 'success'
    store.detailStatus = 'success'

    const wrapper = mount(ClientsPage)

    expect(wrapper.text()).toContain('Create OAuth client')
    expect(wrapper.text()).toContain('Redirect URIs')
    expect(wrapper.find('textarea[name="redirect_uris"]').exists()).toBe(true)
    expect(wrapper.find('textarea[name="post_logout_redirect_uris"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Simpan URI policy')
  })

  it('renders scope consent controls and parity warnings', async () => {
    const store = useClientsStore()
    store.clients = [{ ...client, allowed_scopes: ['openid', 'profile', 'unknown_scope'] }]
    store.selectedClientId = 'prototype-app-a'
    store.status = 'success'
    store.detailStatus = 'success'
    const updateSpy = vi.spyOn(store, 'updateSelected').mockResolvedValue()

    const wrapper = mount(ClientsPage)

    expect(wrapper.text()).toContain('Scope & consent policy')
    expect(wrapper.text()).toContain('Scope label parity warning')
    expect(wrapper.find('textarea[name="allowed_scopes"]').exists()).toBe(true)

    await wrapper.get('textarea[name="allowed_scopes"]').setValue('openid\nprofile\nemail')
    await wrapper.get('form[data-test="scope-policy-form"]').trigger('submit')

    expect(updateSpy).toHaveBeenCalledWith({
      allowed_scopes: ['openid', 'profile', 'email'],
    })
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

  it('renders safe forbidden state', () => {
    const store = useClientsStore()
    store.status = 'forbidden'
    store.errorMessage = 'Kamu tidak memiliki izin untuk melihat OAuth clients.'

    const wrapper = mount(ClientsPage)

    expect(wrapper.text()).toContain('Akses OAuth clients ditolak')
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

    expect(wrapper.text()).toContain('Belum ada OAuth client untuk ditampilkan.')
  })
})
