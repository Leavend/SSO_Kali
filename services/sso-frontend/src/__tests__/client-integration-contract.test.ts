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

  it('adds confidential SCIM controls without exposing a browser-generated secret', () => {
    const draft = {
      ...defaultIntegrationDraft(),
      clientType: 'confidential',
      provisioning: 'scim',
    } satisfies ClientIntegrationDraft
    const contract = createClientIntegrationContract(draft)

    expect(contract.env).toContain('SSO_CLIENT_SECRET=<store-in-vault>')
    expect(contract.scopes).toContain('sso:session.register')
    expect(contract.provisioningSteps).toContain('Sync Users and Groups.')
    expect(contract.findings).toContain('RFC 7642 lifecycle covered by SCIM provisioning.')
  })
})
