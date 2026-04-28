import { describe, expect, it } from 'vitest'
import {
  createClientIntegrationContract,
  defaultIntegrationDraft,
  validateClientIntegrationDraft,
} from '@shared/client-integration'
import type { ClientIntegrationDraft } from '@shared/client-integration'

describe('client integration contract', () => {
  it('generates a public PKCE onboarding contract from the default draft', () => {
    const draft = defaultIntegrationDraft()
    const contract = createClientIntegrationContract(draft)

    expect(validateClientIntegrationDraft(draft)).toEqual([])
    expect(contract.clientId).toBe('customer-portal')
    expect(contract.redirectUri).toBe('https://customer-dev.timeh.my.id/auth/callback')
    expect(contract.scopes).toContain('offline_access')
    expect(contract.env).toContain('SSO_CLIENT_ID=customer-portal')
    expect(contract.registryPatch).toContain("'customer-portal' => [")
    expect(contract.provisioningManifest.mode).toBe('jit')
    expect(contract.provisioningManifest.riskGates).toContain('Isolated dev callback')
  })

  it('rejects unsafe live URLs and wildcard redirect paths', () => {
    const draft = {
      ...defaultIntegrationDraft(),
      appBaseUrl: 'http://customer.timeh.my.id',
      callbackPath: '/auth/*',
      environment: 'live',
    } satisfies ClientIntegrationDraft

    expect(validateClientIntegrationDraft(draft)).toEqual([
      'Live client wajib memakai HTTPS.',
      'Callback path tidak boleh wildcard.',
    ])
  })

  it('rejects non-canonical origins and ambiguous callback paths', () => {
    const draft = {
      ...defaultIntegrationDraft(),
      appBaseUrl: 'https://user:secret@customer.timeh.my.id/admin?next=/home#token',
      callbackPath: '//evil.example/callback',
      logoutPath: '/../logout?token=leak',
      environment: 'live',
    } satisfies ClientIntegrationDraft

    expect(validateClientIntegrationDraft(draft)).toEqual([
      'Base URL tidak boleh memuat credentials.',
      'Base URL hanya boleh berisi origin tanpa path, query, atau fragment.',
      'Callback path tidak boleh diawali //.',
      'Logout path tidak boleh mengandung query atau fragment.',
      'Logout path tidak boleh mengandung traversal.',
    ])
  })

  it('canonicalizes origins before emitting exact redirect uri artifacts', () => {
    const draft = {
      ...defaultIntegrationDraft(),
      appBaseUrl: 'HTTPS://Customer-Dev.Timeh.My.ID:443/',
      environment: 'live',
    } satisfies ClientIntegrationDraft
    const contract = createClientIntegrationContract(draft)

    expect(validateClientIntegrationDraft(draft)).toEqual([])
    expect(contract.redirectUri).toBe('https://customer-dev.timeh.my.id/auth/callback')
    expect(contract.registryPatch).toContain("  'post_logout_redirect_uris' => ['https://customer-dev.timeh.my.id'],")
  })

  it('adds confidential SCIM controls without exposing a browser-generated secret', () => {
    const draft = {
      ...defaultIntegrationDraft(),
      clientType: 'confidential',
      provisioning: 'scim',
    } satisfies ClientIntegrationDraft
    const contract = createClientIntegrationContract(draft)

    expect(contract.env).toContain('SSO_CLIENT_SECRET=<store-in-vault>')
    expect(contract.registryPatch).toContain("  'secret' => env('CUSTOMER_PORTAL_CLIENT_SECRET_HASH'),")
    expect(contract.scopes).toContain('sso:session.register')
    expect(contract.provisioningSteps).toContain('Sync Users and Groups.')
    expect(contract.provisioningManifest.requiredSchemas).toContain('SCIM User resource')
    expect(contract.provisioningManifest.deprovisioning).toContain(
      'SCIM active=false disables local account before next login',
    )
    expect(contract.findings).toContain('RFC 7642 lifecycle covered by SCIM provisioning.')
  })
})
