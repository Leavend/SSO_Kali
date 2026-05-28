import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ExternalIdpsPage from '../ExternalIdpsPage.vue'
import { useExternalIdpsStore } from '../../stores/external-idps.store'
import type { ExternalIdentityProvider } from '../../types'

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

describe('ExternalIdpsPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
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
})
