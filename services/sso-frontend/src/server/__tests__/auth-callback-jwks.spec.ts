import http from 'node:http'
import net from 'node:net'
import { createSign, generateKeyPairSync } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { exportJWK } from 'jose'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleCallbackSession } from '../auth-handlers.js'
import { transactionCookie } from '../session.js'
import { __clearDiscoveryCacheForTests } from '../../lib/oidc/discovery.js'
import type { AdminPrincipal } from '../../shared/admin.js'

const issuer = 'https://sso.example.test'
const jwksUrl = `${issuer}/jwks`
const tokenUrl = `${issuer}/token`
const appBaseUrl = 'https://admin.example.test'
const clientId = 'sso-admin-panel'

let originalFetch: typeof fetch

beforeEach(() => {
  originalFetch = globalThis.fetch
  process.env.VITE_SSO_BASE_URL = issuer
  process.env.SSO_INTERNAL_TOKEN_URL = tokenUrl
  process.env.SSO_INTERNAL_JWKS_URL = jwksUrl
  process.env.VITE_ADMIN_BASE_URL = appBaseUrl
  process.env.VITE_CLIENT_ID = clientId
  process.env.SESSION_ENCRYPTION_SECRET = 'test-secret-with-at-least-32-characters'
  process.env.SSO_INTERNAL_ADMIN_API_URL = `${issuer}/admin/api`
  __clearDiscoveryCacheForTests()
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
  __clearDiscoveryCacheForTests()
})

describe('BFF OIDC callback ID token validation', () => {
  it('fetches discovery + JWKS and creates a secure session for a valid ID token', async () => {
    const fixture = await tokenFixture({ tokenKid: 'valid-kid', jwksKid: 'valid-kid' })
    const fetchMock = mockOidcFetch(fixture)

    const response = await handleCallbackSession(request({ code: 'code', state: 'state' }))

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith(`${issuer}/.well-known/openid-configuration`, expect.objectContaining({ method: 'GET' }))
    expect(fetchMock).toHaveBeenCalledWith(jwksUrl, expect.objectContaining({ method: 'GET' }))
    expect(response.body).toBe(JSON.stringify({ authenticated: true, post_login_redirect: '/dashboard' }))
    expect(response.headers?.['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('__Host-admin-session='),
        expect.stringContaining('HttpOnly'),
        expect.stringContaining('Secure'),
      ]),
    )
  })

  it('rejects an ID token signed by an unknown kid', async () => {
    mockOidcFetch(await tokenFixture({ tokenKid: 'unknown-kid', jwksKid: 'valid-kid' }))

    const response = await handleCallbackSession(request({ code: 'code', state: 'state' }))

    expect(response.status).toBe(401)
    expect(response.body).toBe(JSON.stringify({ error: 'callback_failed', message: 'Gagal menyiapkan sesi aman.' }))
  })

  it('rejects an invalid ID token signature', async () => {
    const fixture = await tokenFixture({ tokenKid: 'valid-kid', jwksKid: 'valid-kid' })
    mockOidcFetch({ ...fixture, token: `${fixture.token}tampered` })

    const response = await handleCallbackSession(request({ code: 'code', state: 'state' }))

    expect(response.status).toBe(401)
  })

  it('rejects wrong issuer, audience, and nonce', async () => {
    expect.hasAssertions()

    await expectRejected({ issuerOverride: 'https://evil.example.test' })
    await expectRejected({ audienceOverride: 'wrong-client' })
    await expectRejected({ nonceOverride: 'wrong-nonce' })
  })
})

async function expectRejected(overrides: {
  readonly issuerOverride?: string
  readonly audienceOverride?: string
  readonly nonceOverride?: string
}): Promise<void> {
  __clearDiscoveryCacheForTests()
  mockOidcFetch(await tokenFixture({ tokenKid: 'valid-kid', jwksKid: 'valid-kid', ...overrides }))

  const response = await handleCallbackSession(request({ code: 'code', state: 'state' }))

  expect(response.status).toBe(401)
}

function request(body: { readonly code: string; readonly state: string }): IncomingMessage {
  const req = new http.IncomingMessage(new net.Socket())
  req.headers.cookie = transactionCookie({
    state: 'state',
    nonce: 'nonce',
    codeVerifier: 'verifier',
    returnTo: '/dashboard',
  })
  req.push(JSON.stringify(body))
  req.push(null)
  return req
}

async function tokenFixture(options: {
  readonly tokenKid: string
  readonly jwksKid: string
  readonly issuerOverride?: string
  readonly audienceOverride?: string
  readonly nonceOverride?: string
}): Promise<{ readonly token: string; readonly jwk: Record<string, unknown> }> {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const jwk = await exportJWK(publicKey)
  const now = Math.floor(Date.now() / 1000)
  const header = base64UrlJson({ alg: 'ES256', kid: options.tokenKid, typ: 'JWT' })
  const payload = base64UrlJson({
    iss: options.issuerOverride ?? issuer,
    aud: options.audienceOverride ?? clientId,
    sub: 'user-1',
    nonce: options.nonceOverride ?? 'nonce',
    iat: now,
    exp: now + 300,
  })
  const signingInput = `${header}.${payload}`
  const signature = createSign('SHA256').update(signingInput).end().sign({ key: privateKey, dsaEncoding: 'ieee-p1363' })

  return {
    token: `${signingInput}.${signature.toString('base64url')}`,
    jwk: { ...jwk, kid: options.jwksKid, alg: 'ES256', use: 'sig' },
  }
}

function mockOidcFetch(fixture: { readonly token: string; readonly jwk: Record<string, unknown> }) {
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)

    if (url === `${issuer}/.well-known/openid-configuration`) {
      return jsonResponse({
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: tokenUrl,
        jwks_uri: jwksUrl,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['ES256'],
      })
    }

    if (url === tokenUrl) {
      expect(init?.method).toBe('POST')
      return jsonResponse({ access_token: 'access-token', refresh_token: 'refresh-token', id_token: fixture.token, expires_in: 300 })
    }

    if (url === jwksUrl) return jsonResponse({ keys: [fixture.jwk] })
    if (url === `${issuer}/admin/api/me`) return jsonResponse({ principal: principal() })

    return new Response('not found', { status: 404 })
  })

  globalThis.fetch = fetchMock as typeof fetch
  return fetchMock
}

function base64UrlJson(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

function principal(): AdminPrincipal {
  return {
    subject_id: 'user-1',
    email: 'user@example.test',
    display_name: 'User Example',
    role: 'admin',
    last_login_at: new Date().toISOString(),
    auth_context: {
      auth_time: Math.floor(Date.now() / 1000),
      amr: ['pwd'],
      acr: 'urn:sso:loa:pwd',
    },
    permissions: {
      view_admin_panel: true,
      manage_sessions: true,
    },
  }
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
