import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionStore } from '@/stores/session.store'
import ExternalIdpsPage from '../ExternalIdpsPage.vue'
import { useExternalIdpsStore } from '../../stores/external-idps.store'
import type { ExternalIdentityProvider } from '../../types'

vi.mock('../../services/external-idps.api', () => ({
  externalIdpsApi: {
    list: vi.fn<() => Promise<unknown>>(),
    show: vi.fn<() => Promise<unknown>>(),
    create: vi.fn<() => Promise<unknown>>(),
    update: vi.fn<() => Promise<unknown>>(),
    previewMapping: vi.fn<() => Promise<unknown>>(),
    delete: vi.fn<() => Promise<unknown>>(),
  },
}))

const provider: ExternalIdentityProvider = {
  provider_key: 'google',
  display_name: 'Google Workspace',
  issuer: 'https://accounts.google.com',
  metadata_url: 'https://accounts.google.com/.well-known/openid-configuration',
  client_id: 'google-client',
  authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  token_endpoint: 'https://oauth2.googleapis.com/token',
  userinfo_endpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
  jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
  allowed_algorithms: ['RS256'],
  scopes: ['openid', 'profile', 'email'],
  priority: 10,
  enabled: true,
  is_backup: false,
  tls_validation_enabled: true,
  signature_validation_enabled: true,
  has_client_secret: true,
  health_status: 'healthy',
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
    'admin.external-idps.write': true,
    'admin.sessions.terminate': true,
  })
}

describe('ExternalIdpsPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    seedFullAccessPrincipal()
  })

  it('renders provider config, mapping preview, health, and request evidence', () => {
    const store = useExternalIdpsStore()
    store.status = 'success'
    store.providers = [provider]
    store.selectedProviderKey = 'google'
    store.mappingPreview = {
      mapped: { subject_id: 'sub_123', email: 'admin@example.test' },
      errors: [],
      warnings: ['Email verified claim missing'],
      missing_email_strategy: 'reject',
      safe_to_link: true,
    }
    store.requestId = 'req-idp-1'

    const wrapper = mount(ExternalIdpsPage)

    expect(wrapper.text()).toContain('External IdPs')
    expect(wrapper.text()).toContain('Google Workspace')
    expect(wrapper.text()).toContain('https://accounts.google.com')
    expect(wrapper.text()).toContain('healthy')
    expect(wrapper.text()).toContain('safe to link')
    expect(wrapper.text()).toContain('req-idp-1')
    expect(wrapper.text()).not.toMatch(/Bearer|client_secret|access_token|SQLSTATE/u)
  })

  it('renders safe forbidden state', () => {
    const store = useExternalIdpsStore()
    store.status = 'forbidden'
    store.errorMessage = 'Kamu tidak memiliki izin untuk melihat External IdP admin.'

    const wrapper = mount(ExternalIdpsPage)

    expect(wrapper.text()).toContain('Akses External IdP ditolak')
    expect(wrapper.text()).not.toContain('SQLSTATE')
  })

  it('renders empty state and Add External IdP toggle when no providers exist', () => {
    const store = useExternalIdpsStore()
    store.status = 'success'
    store.providers = []
    store.selectedProviderKey = null
    store.mappingPreview = null

    const wrapper = mount(ExternalIdpsPage)

    expect(wrapper.text()).toContain('Belum ada provider eksternal untuk ditampilkan.')
    expect(wrapper.find('.ui-empty-state').exists()).toBe(true)
    expect(wrapper.find('button.create-idp-toggle').exists()).toBe(true)
  })

  it('uses shared state, table, and form primitives', async () => {
    const store = useExternalIdpsStore()
    store.status = 'loading'

    const wrapper = mount(ExternalIdpsPage)

    expect(wrapper.find('.ui-skeleton').exists()).toBe(true)

    store.status = 'forbidden'
    store.errorMessage = 'Kamu tidak memiliki izin untuk melihat External IdP admin.'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.ui-status-view').exists()).toBe(true)

    store.status = 'success'
    store.providers = [provider]
    store.selectedProviderKey = 'google'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.ui-data-list').exists()).toBe(true)
    expect(wrapper.find('.ui-form-field').exists()).toBe(true)
    expect(wrapper.find('.ui-control').exists()).toBe(true)
  })

  it('shows Add External IdP form with required inputs on toggle', async () => {
    const store = useExternalIdpsStore()
    store.status = 'success'
    store.providers = []

    const wrapper = mount(ExternalIdpsPage)

    expect(wrapper.find('input[name="create-provider-key"]').exists()).toBe(false)

    await wrapper.find('button.create-idp-toggle').trigger('click')

    expect(wrapper.find('input[name="create-provider-key"]').exists()).toBe(true)
    expect(wrapper.find('input[name="create-display-name"]').exists()).toBe(true)
    expect(wrapper.find('input[name="create-issuer"]').exists()).toBe(true)
    expect(wrapper.find('input[name="create-metadata-url"]').exists()).toBe(true)
    expect(wrapper.find('input[name="create-client-id"]').exists()).toBe(true)
  })

  it('submits create form and calls store.createProvider with parsed payload', async () => {
    const store = useExternalIdpsStore()
    store.status = 'success'
    store.providers = []

    const createSpy = vi.spyOn(store, 'createProvider').mockImplementation(() => Promise.resolve())

    const wrapper = mount(ExternalIdpsPage)

    await wrapper.find('button.create-idp-toggle').trigger('click')

    await wrapper.find('input[name="create-provider-key"]').setValue('azure')
    await wrapper.find('input[name="create-display-name"]').setValue('Azure AD')
    await wrapper
      .find('input[name="create-issuer"]')
      .setValue('https://login.microsoftonline.com/tenant')
    await wrapper
      .find('input[name="create-metadata-url"]')
      .setValue('https://login.microsoftonline.com/tenant/.well-known/openid-configuration')
    await wrapper.find('input[name="create-client-id"]').setValue('azure-app-id')

    await wrapper.find('button.create-idp-submit').trigger('click')

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        provider_key: 'azure',
        display_name: 'Azure AD',
        issuer: 'https://login.microsoftonline.com/tenant',
        client_id: 'azure-app-id',
      }),
    )
  })

  it('keeps delete button disabled until provider_key confirmation matches', async () => {
    const store = useExternalIdpsStore()
    store.status = 'success'
    store.providers = [provider]
    store.selectedProviderKey = 'google'

    const wrapper = mount(ExternalIdpsPage)

    expect(wrapper.find('button.delete-idp-button').attributes('disabled')).toBeDefined()

    await wrapper.find('input[name="delete-confirm-key"]').setValue('wrong-key')
    expect(wrapper.find('button.delete-idp-button').attributes('disabled')).toBeDefined()

    await wrapper.find('input[name="delete-confirm-key"]').setValue('google')
    expect(wrapper.find('button.delete-idp-button').attributes('disabled')).toBeUndefined()
  })

  it('calls store.deleteSelected when provider_key confirmed and delete submitted', async () => {
    const store = useExternalIdpsStore()
    store.status = 'success'
    store.providers = [provider]
    store.selectedProviderKey = 'google'

    const deleteSpy = vi.spyOn(store, 'deleteSelected').mockImplementation(() => Promise.resolve())

    const wrapper = mount(ExternalIdpsPage)

    await wrapper.find('input[name="delete-confirm-key"]').setValue('google')
    await wrapper.find('button.delete-idp-button').trigger('click')

    expect(deleteSpy).toHaveBeenCalled()
  })

  it('renders edit form pre-filled from selectedProvider and calls store.updateSelected on submit', async () => {
    const store = useExternalIdpsStore()
    store.status = 'success'
    store.providers = [provider]
    store.selectedProviderKey = 'google'

    const updateSpy = vi.spyOn(store, 'updateSelected').mockImplementation(() => Promise.resolve())

    const wrapper = mount(ExternalIdpsPage)

    expect(
      (wrapper.find('input[name="edit-display-name"]').element as HTMLInputElement).value,
    ).toBe('Google Workspace')
    expect((wrapper.find('input[name="edit-client-id"]').element as HTMLInputElement).value).toBe(
      'google-client',
    )

    await wrapper.find('input[name="edit-display-name"]').setValue('Google Workspace Updated')

    await wrapper.find('button.edit-idp-submit').trigger('click')

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        display_name: 'Google Workspace Updated',
      }),
    )
  })

  it('hides external IdP write actions for read-only principals', () => {
    seedPrincipal({})
    const store = useExternalIdpsStore()
    store.status = 'success'
    store.providers = [provider]
    store.selectedProviderKey = 'google'

    const wrapper = mount(ExternalIdpsPage)

    expect(wrapper.text()).not.toContain('Add External IdP')
    expect(wrapper.text()).not.toContain('Save changes')
    expect(wrapper.text()).not.toContain('Delete Provider')
    expect(wrapper.text()).not.toContain('Preview mapping')
  })

  it('requires session termination permission for external IdP deletion', () => {
    seedPrincipal({ 'admin.external-idps.write': true })
    const store = useExternalIdpsStore()
    store.status = 'success'
    store.providers = [provider]
    store.selectedProviderKey = 'google'

    const wrapper = mount(ExternalIdpsPage)

    expect(wrapper.text()).toContain('Add External IdP')
    expect(wrapper.text()).toContain('Save changes')
    expect(wrapper.text()).toContain('Preview mapping')
    expect(wrapper.text()).not.toContain('Delete Provider')
  })
})
