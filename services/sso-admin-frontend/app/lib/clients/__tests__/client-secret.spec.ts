import { describe, expect, it } from 'vitest'
import { buildClientEnvSnippet, extractRevealedSecret } from '../client-secret'
import type { ClientSecretRotation } from '@/types/clients.types'

// A clearly-sample secret: reads as a sample, never a real credential.
const SAMPLE_SECRET = 'sample-secret-DO-NOT-USE-9f8e7d6c'

describe('extractRevealedSecret', () => {
  it('returns null for null / undefined', () => {
    expect(extractRevealedSecret(null)).toBeNull()
    expect(extractRevealedSecret(undefined)).toBeNull()
  })

  it('prefers plaintext_secret over every other field', () => {
    const rotation: ClientSecretRotation = {
      client_id: 'sample-app',
      plaintext_secret: SAMPLE_SECRET,
      plaintext_once: 'other-1',
      client_secret: 'other-2',
      secret: 'other-3',
    }
    expect(extractRevealedSecret(rotation)).toBe(SAMPLE_SECRET)
  })

  it('walks the fallback chain plaintext_once -> client_secret -> secret', () => {
    expect(extractRevealedSecret({ client_id: 'a', plaintext_once: SAMPLE_SECRET })).toBe(
      SAMPLE_SECRET,
    )
    expect(extractRevealedSecret({ client_id: 'a', client_secret: SAMPLE_SECRET })).toBe(
      SAMPLE_SECRET,
    )
    expect(extractRevealedSecret({ client_id: 'a', secret: SAMPLE_SECRET })).toBe(SAMPLE_SECRET)
  })

  it('returns null when no plaintext field is present (public client)', () => {
    expect(extractRevealedSecret({ client_id: 'public-app' })).toBeNull()
  })
})

describe('buildClientEnvSnippet', () => {
  it('emits SSO_CLIENT_ID always and SSO_CLIENT_SECRET only when a secret is present', () => {
    const withSecret = buildClientEnvSnippet({ clientId: 'sample-app', secret: SAMPLE_SECRET })
    expect(withSecret).toContain('SSO_CLIENT_ID=sample-app')
    expect(withSecret).toContain(`SSO_CLIENT_SECRET=${SAMPLE_SECRET}`)

    const publicClient = buildClientEnvSnippet({ clientId: 'public-app' })
    expect(publicClient).toContain('SSO_CLIENT_ID=public-app')
    expect(publicClient).not.toContain('SSO_CLIENT_SECRET')
  })

  it('omits absent optional fields and joins scopes with a single space', () => {
    const snippet = buildClientEnvSnippet({
      clientId: 'sample-app',
      issuer: 'https://api-sso.example.test',
      redirectUri: 'https://app.example.test/callback',
      scopes: ['openid', 'profile', 'email'],
    })
    expect(snippet).toContain('SSO_ISSUER=https://api-sso.example.test')
    expect(snippet).toContain('SSO_REDIRECT_URI=https://app.example.test/callback')
    expect(snippet).toContain('SSO_SCOPES=openid profile email')
    expect(snippet).not.toContain('SSO_POST_LOGOUT_URI')
    expect(snippet).not.toContain('SSO_CLIENT_SECRET')
  })
})
