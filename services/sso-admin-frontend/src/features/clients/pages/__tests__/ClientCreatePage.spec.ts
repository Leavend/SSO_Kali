import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionStore } from '@/stores/session.store'
import ClientCreatePage from '../ClientCreatePage.vue'
import FormPageShell from '@/components/form/FormPageShell.vue'
import { useClientsStore } from '../../stores/clients.store'
import { useToast } from '@/components/ui/useToast'
import { useI18n } from '@/composables/useI18n'
import type { AdminClient } from '../../types'

const pushSpy = vi.fn<(to: any) => any>()
vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: pushSpy,
  }),
}))

vi.mock('../../services/clients.api', () => ({
  clientsApi: {
    list: vi.fn<() => Promise<unknown>>(),
    show: vi.fn<() => Promise<unknown>>(),
    update: vi.fn<() => Promise<unknown>>(),
    create: vi.fn<() => Promise<unknown>>(),
    rotateSecret: vi.fn<() => Promise<unknown>>(),
    getScopes: vi.fn<() => Promise<unknown>>().mockResolvedValue({
      scopes: [
        { name: 'openid', description: 'Access OIDC openid' },
        { name: 'profile', description: 'Access OIDC profile' },
        { name: 'email', description: 'Access OIDC email' },
      ],
    }),
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

describe('ClientCreatePage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    pushSpy.mockClear()
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
        manage_sessions: true,
        capabilities: { 'admin.clients.write': true },
        permissions: ['admin.clients.write'],
        menus: [],
      },
    })
  })

  it('renders ClientCreatePage fields and options', async () => {
    const wrapper = mount(ClientCreatePage)
    expect(wrapper.text()).toContain('Create OAuth client')
    expect(wrapper.find('input[name="create_display_name"]').exists()).toBe(true)
    expect(wrapper.find('input[name="client_id"]').exists()).toBe(true)
  })

  it('submits client creation successfully', async () => {
    const store = useClientsStore()
    const toast = useToast()
    toast.clearToasts()

    const createdClient = {
      ...client,
      client_id: 'prototype-app-b',
      display_name: 'Prototype App B',
      type: 'public',
      status: 'active',
    }
    const createSpy = vi
      .spyOn(store, 'createClient')
      .mockResolvedValue({ registration: createdClient })

    const wrapper = mount(ClientCreatePage)
    await wrapper.get('input[name="create_display_name"]').setValue('Prototype App B')
    await wrapper.get('input[name="create_owner_email"]').setValue('owner@example.test')
    await wrapper.get('input[name="create_redirect_uri"]').setValue('https://app-b.example.test/callback')
    await wrapper.findComponent(FormPageShell).vm.$emit('submit')

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

    expect(toast.toasts.value).toHaveLength(1)
    expect(toast.toasts.value[0]?.title).toBe(useI18n().t('clients.create_public_success'))
  })

  it('submits confidential client creation successfully and shows confidential success toast', async () => {
    const store = useClientsStore()
    const toast = useToast()
    toast.clearToasts()

    const createdClient = {
      ...client,
      client_id: 'prototype-app-c',
      display_name: 'Prototype App C',
      type: 'confidential',
      status: 'active',
    }
    const createSpy = vi
      .spyOn(store, 'createClient')
      .mockResolvedValue({ registration: createdClient })

    const wrapper = mount(ClientCreatePage)
    await wrapper.get('input[name="create_display_name"]').setValue('Prototype App C')
    await wrapper.get('input[name="create_owner_email"]').setValue('owner@example.test')
    await wrapper.get('input[name="create_redirect_uri"]').setValue('https://app-c.example.test/callback')
    
    // Select confidential type (simulate UI button click)
    const buttons = wrapper.findAll('button')
    const confidentialButton = buttons.find(b => b.text().toLowerCase().includes('confidential'))
    if (confidentialButton) {
      await confidentialButton.trigger('click')
    }

    await wrapper.findComponent(FormPageShell).vm.$emit('submit')

    expect(createSpy).toHaveBeenCalledWith({
      app_name: 'Prototype App C',
      client_id: 'prototype-app-c',
      environment: 'development',
      client_type: 'confidential',
      app_base_url: 'https://app-c.example.test',
      callback_path: '/callback',
      logout_path: '/auth/backchannel/logout',
      owner_email: 'owner@example.test',
      provisioning: 'jit',
      allowed_scopes: ['openid', 'profile', 'email'],
    })

    expect(toast.toasts.value).toHaveLength(1)
    expect(toast.toasts.value[0]?.title).toBe(useI18n().t('clients.create_confidential_success'))
  })
})
