import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { externalIdpsApi } from '../../services/external-idps.api'
import { useExternalIdpsStore } from '../external-idps.store'
import type { ExternalIdentityProvider } from '../../types'

vi.mock('../../services/external-idps.api', () => ({
  externalIdpsApi: {
    list: vi.fn<() => Promise<{ providers: readonly ExternalIdentityProvider[] }>>(),
    show: vi.fn<() => Promise<{ provider: ExternalIdentityProvider }>>(),
    create: vi.fn<() => Promise<{ provider: ExternalIdentityProvider }>>(),
    update: vi.fn<() => Promise<{ provider: ExternalIdentityProvider }>>(),
    previewMapping: vi.fn<() => Promise<{ preview: unknown }>>(),
    delete: vi.fn<() => Promise<void>>(),
  },
}))

vi.mock('@/lib/api/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/api-client')>()
  return {
    ...actual,
    getLastRequestId: vi.fn<() => string | null>(() => 'req-idp-1'),
  }
})

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

describe('useExternalIdpsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(externalIdpsApi.list).mockReset()
    vi.mocked(externalIdpsApi.show).mockReset()
    vi.mocked(externalIdpsApi.create).mockReset()
    vi.mocked(externalIdpsApi.update).mockReset()
    vi.mocked(externalIdpsApi.previewMapping).mockReset()
    vi.mocked(externalIdpsApi.delete).mockReset()
    vi.mocked(getLastRequestId).mockReturnValue('req-idp-1')
  })

  it('loads providers and stores request evidence', async () => {
    vi.mocked(externalIdpsApi.list).mockResolvedValue({ providers: [provider] })
    const store = useExternalIdpsStore()

    await store.load()

    expect(store.status).toBe('success')
    expect(store.providers).toEqual([provider])
    expect(store.selectedProviderKey).toBe('google')
    expect(store.requestId).toBe('req-idp-1')
  })

  it('updates provider enabled state for disable/failover controls', async () => {
    vi.mocked(externalIdpsApi.update).mockResolvedValue({
      provider: { ...provider, enabled: false, is_backup: true },
    })
    const store = useExternalIdpsStore()
    store.providers = [provider]
    store.selectedProviderKey = 'google'

    await store.updateSelected({ enabled: false, is_backup: true })

    expect(store.selectedProvider?.enabled).toBe(false)
    expect(store.selectedProvider?.is_backup).toBe(true)
    expect(externalIdpsApi.update).toHaveBeenCalledWith('google', {
      enabled: false,
      is_backup: true,
    })
  })

  it('previews mapping without storing raw secrets', async () => {
    vi.mocked(externalIdpsApi.previewMapping).mockResolvedValue({
      preview: {
        mapped: { subject_id: 'sub_123', email: 'admin@example.test' },
        errors: [],
        warnings: [],
        missing_email_strategy: 'reject',
        safe_to_link: true,
      },
    })
    const store = useExternalIdpsStore()
    store.selectedProviderKey = 'google'

    await store.previewSelectedMapping({
      sub: 'ext-sub',
      email: 'admin@example.test',
      access_token: 'Bearer raw',
    })

    expect(store.mappingPreview?.safe_to_link).toBe(true)
    expect(JSON.stringify(store.mappingPreview)).not.toContain('Bearer raw')
  })

  it('maps step-up errors to safe copy', async () => {
    vi.mocked(externalIdpsApi.update).mockRejectedValue(
      new ApiError(428, 'raw ACR trace', 'fresh_auth_required', null, 'req-idp-step'),
    )
    const store = useExternalIdpsStore()
    store.selectedProviderKey = 'google'

    await store.updateSelected({ enabled: false })

    expect(store.actionStatus).toBe('step_up_required')
    expect(store.requestId).toBe('req-idp-step')
    expect(store.errorMessage).toBe(
      'Aksi External IdP membutuhkan fresh-auth atau MFA assurance. Ulangi login admin lalu coba lagi.',
    )
    expect(store.errorMessage).not.toContain('raw ACR')
  })

  it('maps forbidden load errors to safe copy', async () => {
    vi.mocked(externalIdpsApi.list).mockRejectedValue(new ApiError(403, 'SQLSTATE forbidden leak'))
    const store = useExternalIdpsStore()

    await store.load()

    expect(store.status).toBe('forbidden')
    expect(store.errorMessage).toBe('Kamu tidak memiliki izin untuk melihat External IdP admin.')
    expect(store.errorMessage).not.toContain('SQLSTATE')
  })
})
