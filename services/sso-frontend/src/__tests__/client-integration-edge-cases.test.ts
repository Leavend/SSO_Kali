import { describe, expect, it } from 'vitest'
import {
  createClientIntegrationContract,
  defaultIntegrationDraft,
  suggestClientId,
  validateClientIntegrationDraft,
} from '@shared/client-integration'
import type { ClientIntegrationDraft } from '@shared/client-integration'

function draftWith(overrides: Partial<ClientIntegrationDraft>): ClientIntegrationDraft {
  return { ...defaultIntegrationDraft(), ...overrides }
}

describe('suggestClientId', () => {
  it('converts uppercase app names to lowercase slugs', () => {
    expect(suggestClientId('My Great App')).toBe('my-great-app')
  })

  it('strips special characters from app name', () => {
    expect(suggestClientId('App!@#Name$%^')).toBe('app-name')
  })

  it('trims leading and trailing dashes', () => {
    expect(suggestClientId('---trimmed---')).toBe('trimmed')
  })

  it('returns new-client-app for empty input', () => {
    expect(suggestClientId('')).toBe('new-client-app')
  })

  it('truncates slugs to 48 characters', () => {
    const longName = 'a'.repeat(60)
    expect(suggestClientId(longName).length).toBeLessThanOrEqual(48)
  })
})

describe('required field validation', () => {
  it('returns error for empty appName', () => {
    const errors = validateClientIntegrationDraft(draftWith({ appName: '' }))
    expect(errors).toContain('Nama aplikasi wajib diisi.')
  })

  it('returns error for empty clientId', () => {
    const errors = validateClientIntegrationDraft(draftWith({ clientId: '' }))
    expect(errors).toContain('Client ID wajib diisi.')
  })

  it('returns error for empty appBaseUrl', () => {
    const errors = validateClientIntegrationDraft(draftWith({ appBaseUrl: '' }))
    expect(errors).toContain('Base URL wajib diisi.')
  })

  it('returns error for empty ownerEmail', () => {
    const errors = validateClientIntegrationDraft(draftWith({ ownerEmail: '' }))
    expect(errors).toContain('Owner email wajib diisi.')
  })

  it('returns all four errors when all fields are empty', () => {
    const errors = validateClientIntegrationDraft(
      draftWith({ appName: '', clientId: '', appBaseUrl: '', ownerEmail: '' }),
    )
    expect(errors).toContain('Nama aplikasi wajib diisi.')
    expect(errors).toContain('Client ID wajib diisi.')
    expect(errors).toContain('Base URL wajib diisi.')
    expect(errors).toContain('Owner email wajib diisi.')
  })
})

describe('client ID validation edge cases', () => {
  it('rejects client IDs shorter than 3 characters', () => {
    const errors = validateClientIntegrationDraft(draftWith({ clientId: 'ab' }))
    expect(errors).toContain('Client ID harus slug 3-63 karakter.')
  })

  it('rejects client IDs longer than 63 characters', () => {
    const errors = validateClientIntegrationDraft(draftWith({ clientId: 'a'.repeat(64) }))
    expect(errors).toContain('Client ID harus slug 3-63 karakter.')
  })

  it('rejects client IDs with uppercase letters', () => {
    const errors = validateClientIntegrationDraft(draftWith({ clientId: 'MyApp' }))
    expect(errors).toContain('Client ID harus slug 3-63 karakter.')
  })

  it('rejects client IDs starting with a dash', () => {
    const errors = validateClientIntegrationDraft(draftWith({ clientId: '-my-app' }))
    expect(errors).toContain('Client ID harus slug 3-63 karakter.')
  })

  it('accepts valid 3-character client IDs', () => {
    const errors = validateClientIntegrationDraft(draftWith({ clientId: 'abc' }))
    expect(errors).not.toContain('Client ID harus slug 3-63 karakter.')
  })

  it('accepts valid client IDs with numbers and dashes', () => {
    const errors = validateClientIntegrationDraft(draftWith({ clientId: 'app-v2-test' }))
    expect(errors).not.toContain('Client ID harus slug 3-63 karakter.')
  })
})

describe('base URL validation edge cases', () => {
  it('rejects completely invalid URLs', () => {
    const errors = validateClientIntegrationDraft(draftWith({ appBaseUrl: 'not-a-url' }))
    expect(errors).toContain('Base URL harus URL valid.')
  })

  it('rejects URLs with paths', () => {
    const errors = validateClientIntegrationDraft(
      draftWith({ appBaseUrl: 'https://example.com/app', environment: 'live' }),
    )
    expect(errors).toContain('Base URL hanya boleh berisi origin tanpa path, query, atau fragment.')
  })

  it('rejects URLs with query strings', () => {
    const errors = validateClientIntegrationDraft(
      draftWith({ appBaseUrl: 'https://example.com?foo=bar', environment: 'live' }),
    )
    expect(errors).toContain('Base URL hanya boleh berisi origin tanpa path, query, atau fragment.')
  })

  it('rejects URLs with fragments', () => {
    const errors = validateClientIntegrationDraft(
      draftWith({ appBaseUrl: 'https://example.com#section', environment: 'live' }),
    )
    expect(errors).toContain('Base URL hanya boleh berisi origin tanpa path, query, atau fragment.')
  })

  it('rejects URLs with userinfo credentials', () => {
    const errors = validateClientIntegrationDraft(
      draftWith({ appBaseUrl: 'https://user:pass@example.com', environment: 'live' }),
    )
    expect(errors).toContain('Base URL tidak boleh memuat credentials.')
  })

  it('accepts HTTPS URLs for live environment', () => {
    const errors = validateClientIntegrationDraft(
      draftWith({ appBaseUrl: 'https://example.com', environment: 'live' }),
    )
    expect(errors).not.toContain('Live client wajib memakai HTTPS.')
    expect(errors).not.toContain('Base URL harus URL valid.')
  })

  it('accepts HTTP localhost for development', () => {
    const errors = validateClientIntegrationDraft(
      draftWith({ appBaseUrl: 'http://localhost:3000', environment: 'development' }),
    )
    expect(errors).not.toContain('Live client wajib memakai HTTPS.')
  })

  it('rejects HTTP non-localhost for development', () => {
    const errors = validateClientIntegrationDraft(
      draftWith({ appBaseUrl: 'http://dev.example.com', environment: 'development' }),
    )
    expect(errors).toContain('Live client wajib memakai HTTPS.')
  })
})

describe('path validation edge cases', () => {
  it('rejects paths not starting with /', () => {
    const errors = validateClientIntegrationDraft(draftWith({ callbackPath: 'auth/callback' }))
    expect(errors).toContain('Callback path harus diawali /.')
  })

  it('rejects paths starting with //', () => {
    const errors = validateClientIntegrationDraft(draftWith({ callbackPath: '//evil.example/cb' }))
    expect(errors).toContain('Callback path tidak boleh diawali //.')
  })

  it('rejects paths containing wildcards', () => {
    const errors = validateClientIntegrationDraft(draftWith({ callbackPath: '/auth/*' }))
    expect(errors).toContain('Callback path tidak boleh wildcard.')
  })

  it('rejects paths with query params', () => {
    const errors = validateClientIntegrationDraft(draftWith({ logoutPath: '/logout?token=x' }))
    expect(errors).toContain('Logout path tidak boleh mengandung query atau fragment.')
  })

  it('rejects paths with fragments', () => {
    const errors = validateClientIntegrationDraft(draftWith({ logoutPath: '/logout#section' }))
    expect(errors).toContain('Logout path tidak boleh mengandung query atau fragment.')
  })

  it('rejects paths with directory traversal', () => {
    const errors = validateClientIntegrationDraft(draftWith({ logoutPath: '/../etc/passwd' }))
    expect(errors).toContain('Logout path tidak boleh mengandung traversal.')
  })

  it('accepts valid complex paths like /auth/v2/callback', () => {
    const errors = validateClientIntegrationDraft(draftWith({ callbackPath: '/auth/v2/callback' }))
    expect(errors).not.toContain('Callback path harus diawali /.')
    expect(errors).not.toContain('Callback path tidak boleh diawali //.')
    expect(errors).not.toContain('Callback path tidak boleh wildcard.')
    expect(errors).not.toContain('Callback path tidak boleh mengandung query atau fragment.')
    expect(errors).not.toContain('Callback path tidak boleh mengandung traversal.')
  })
})

describe('owner email edge cases', () => {
  it('rejects emails without @ symbol', () => {
    const errors = validateClientIntegrationDraft(draftWith({ ownerEmail: 'invalidemail.com' }))
    expect(errors).toContain('Owner email harus valid.')
  })

  it('rejects emails without domain', () => {
    const errors = validateClientIntegrationDraft(draftWith({ ownerEmail: 'user@' }))
    expect(errors).toContain('Owner email harus valid.')
  })

  it('rejects emails with spaces', () => {
    const errors = validateClientIntegrationDraft(draftWith({ ownerEmail: 'user @example.com' }))
    expect(errors).toContain('Owner email harus valid.')
  })

  it('accepts valid emails', () => {
    const errors = validateClientIntegrationDraft(draftWith({ ownerEmail: 'admin@company.co.id' }))
    expect(errors).not.toContain('Owner email harus valid.')
  })
})

describe('contract generation edge cases', () => {
  it('generates correct URIs for paths with subdirectories', () => {
    const draft = draftWith({
      appBaseUrl: 'https://app.example.com',
      callbackPath: '/sso/v2/callback',
      logoutPath: '/sso/v2/logout',
      environment: 'live',
    })
    const contract = createClientIntegrationContract(draft)

    expect(contract.redirectUri).toBe('https://app.example.com/sso/v2/callback')
    expect(contract.backchannelLogoutUri).toBe('https://app.example.com/sso/v2/logout')
  })

  it('generates correct env lines for public client', () => {
    const draft = draftWith({ clientType: 'public' })
    const contract = createClientIntegrationContract(draft)

    expect(contract.env).toContain('SSO_CLIENT_ID=customer-portal')
    expect(contract.env).not.toContain('SSO_CLIENT_SECRET=<store-in-vault>')
  })

  it('generates correct env lines for confidential client', () => {
    const draft = draftWith({ clientType: 'confidential' })
    const contract = createClientIntegrationContract(draft)

    expect(contract.env).toContain('SSO_CLIENT_SECRET=<store-in-vault>')
  })

  it('generates correct scopes for public client', () => {
    const draft = draftWith({ clientType: 'public' })
    const contract = createClientIntegrationContract(draft)

    expect(contract.scopes).toEqual(['openid', 'profile', 'email', 'offline_access'])
    expect(contract.scopes).not.toContain('sso:session.register')
  })

  it('generates correct scopes for confidential client', () => {
    const draft = draftWith({ clientType: 'confidential' })
    const contract = createClientIntegrationContract(draft)

    expect(contract.scopes).toEqual(['openid', 'profile', 'email', 'offline_access', 'sso:session.register'])
    expect(contract.scopes).toContain('sso:session.register')
  })

  it('generates correct secret env name from client ID', () => {
    const draft = draftWith({ clientId: 'my-cool-app', clientType: 'confidential' })
    const contract = createClientIntegrationContract(draft)

    expect(contract.registryPatch).toContain("  'secret' => env('MY_COOL_APP_CLIENT_SECRET_HASH'),")
  })
})

describe('provisioning manifest', () => {
  it('JIT manifest has correct identity source', () => {
    const draft = draftWith({ provisioning: 'jit' })
    const contract = createClientIntegrationContract(draft)

    expect(contract.provisioningManifest.identitySource).toBe('https://dev-sso.timeh.my.id SSO broker')
  })

  it('JIT manifest requires OIDC schemas', () => {
    const draft = draftWith({ provisioning: 'jit' })
    const contract = createClientIntegrationContract(draft)

    expect(contract.provisioningManifest.requiredSchemas).toEqual([
      'OIDC ID token claims',
      'UserInfo profile claims',
    ])
  })

  it('SCIM manifest requires SCIM schemas', () => {
    const draft = draftWith({ provisioning: 'scim' })
    const contract = createClientIntegrationContract(draft)

    expect(contract.provisioningManifest.requiredSchemas).toEqual([
      'SCIM User resource',
      'SCIM Group resource',
      'ServiceProviderConfig discovery',
    ])
  })

  it('SCIM deprovisioning includes active=false', () => {
    const draft = draftWith({ provisioning: 'scim' })
    const contract = createClientIntegrationContract(draft)

    expect(contract.provisioningManifest.deprovisioning).toContain(
      'SCIM active=false disables local account before next login',
    )
  })

  it('JIT deprovisioning includes session revoke', () => {
    const draft = draftWith({ provisioning: 'jit' })
    const contract = createClientIntegrationContract(draft)

    expect(contract.provisioningManifest.deprovisioning).toContain(
      'Back-channel logout revokes sessions by sid',
    )
    expect(contract.provisioningManifest.deprovisioning).toContain(
      'Next login revalidates SSO account state',
    )
  })
})
