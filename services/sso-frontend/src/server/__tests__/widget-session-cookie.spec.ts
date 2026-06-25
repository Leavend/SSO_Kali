import http from 'node:http'
import net from 'node:net'
import { type KeyObject, createSign, generateKeyPairSync } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { exportJWK } from 'jose'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  handleCallback,
  handleCallbackSession,
  handleLogout,
  handleRefresh,
} from '../auth-handlers.js'
import { transactionCookie } from '../session.js'
import { __clearDiscoveryCacheForTests } from '../../lib/oidc/discovery.js'

const issuer = 'https://sso.example.test'
const jwksUrl = `${issuer}/jwks`
const metadataTokenUrl = `${issuer}/oauth/token`
const appBaseUrl = 'https://sso.example.test'
const clientId = 'sso-frontend-portal'
const widgetSid = 'sess-123'

let originalFetch: typeof fetch
// A single signing key pair shared by every fixture so the BFF's in-memory
// remote-JWKS cache (keyed by jwks_uri) validates every token in this file.
const signingKeyPair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })

beforeEach(() => {
  originalFetch = globalThis.fetch
  process.env.VITE_SSO_BASE_URL = issuer
  process.env.SSO_INTERNAL_JWKS_URL = jwksUrl
  process.env.VITE_SSO_FRONTEND_BASE_URL = appBaseUrl
  process.env.VITE_CLIENT_ID = clientId
  process.env.SSO_PORTAL_CLIENT_SECRET = 'portal-bff-secret'
  process.env.SESSION_ENCRYPTION_SECRET = 'test-secret-with-at-least-32-characters'
  __clearDiscoveryCacheForTests()
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
  __clearDiscoveryCacheForTests()
})

describe('widget __Host-sso_session cookie minting at OIDC callback', () => {
  it('mints __Host-sso_session from the validated id_token sid on the redirect callback', async () => {
    mockOidcFetch(await tokenFixture())

    const response = await handleCallback(getRequest(), callbackUrl())

    const widgetCookie = findWidgetCookie(response.headers?.['set-cookie'])
    expect(widgetCookie).not.toBeUndefined()
    expect(widgetCookie).toContain(`__Host-sso_session=${widgetSid}`)
    expect(widgetCookie).toContain('Secure')
    expect(widgetCookie).toContain('Path=/')
    expect(widgetCookie).toContain('HttpOnly')
    expect(widgetCookie).toContain('SameSite=Lax')
    expect(widgetCookie).not.toContain('Domain=')
    expect(widgetCookie).not.toContain('SameSite=None')
  })

  it('mints __Host-sso_session from the validated id_token sid on the JSON callback', async () => {
    mockOidcFetch(await tokenFixture())

    const response = await handleCallbackSession(postRequest({ code: 'code', state: 'state' }))

    expect(response.status).toBe(200)
    const widgetCookie = findWidgetCookie(response.headers?.['set-cookie'])
    expect(widgetCookie).toContain(`__Host-sso_session=${widgetSid}`)
    expect(widgetCookie).toContain('SameSite=Lax')
  })

  it('does not mint __Host-sso_session when the id_token has no sid claim', async () => {
    mockOidcFetch(await tokenFixture({ omitSid: true }))

    const response = await handleCallbackSession(postRequest({ code: 'code', state: 'state' }))

    expect(response.status).toBe(200)
    expect(findWidgetCookie(response.headers?.['set-cookie'])).toBeUndefined()
  })

  it('clears __Host-sso_session on logout', async () => {
    const response = await handleLogout(logoutRequest())

    const widgetCookie = findWidgetCookie(response.headers?.['set-cookie'])
    expect(widgetCookie).not.toBeUndefined()
    expect(widgetCookie).toContain('__Host-sso_session=')
    expect(widgetCookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT')
  })

  it('re-mints __Host-sso_session on token refresh so the widget cookie never lapses mid-session', async () => {
    mockOidcFetch(await tokenFixture())
    const callback = await handleCallbackSession(postRequest({ code: 'code', state: 'state' }))
    const sessionCookieValue = portalSessionCookieValue(callback.headers?.['set-cookie'])
    expect(sessionCookieValue).not.toBeUndefined()

    const refresh = await handleRefresh(refreshRequest(sessionCookieValue!))

    expect(refresh.status).toBe(200)
    const widgetCookie = findWidgetCookie(refresh.headers?.['set-cookie'])
    expect(widgetCookie).toContain(`__Host-sso_session=${widgetSid}`)
    expect(widgetCookie).toContain('Max-Age=')
    expect(widgetCookie).toContain('SameSite=Lax')
    expect(widgetCookie).toContain('HttpOnly')
    expect(widgetCookie).not.toContain('Domain=')
  })

  it('does not set or clear __Host-sso_session on refresh when the session has no sid', async () => {
    mockOidcFetch(await tokenFixture({ omitSid: true }))
    const callback = await handleCallbackSession(postRequest({ code: 'code', state: 'state' }))
    const sessionCookieValue = portalSessionCookieValue(callback.headers?.['set-cookie'])
    expect(sessionCookieValue).not.toBeUndefined()

    const refresh = await handleRefresh(refreshRequest(sessionCookieValue!))

    expect(refresh.status).toBe(200)
    // No mint and no clear — the existing cookie must be left untouched when sid is absent.
    expect(findWidgetCookie(refresh.headers?.['set-cookie'])).toBeUndefined()
  })
})

function findWidgetCookie(cookies: string | readonly string[] | undefined): string | undefined {
  if (!cookies) return undefined
  const list = Array.isArray(cookies) ? cookies : [cookies as string]
  return list.find((cookie) => cookie.startsWith('__Host-sso_session='))
}

function portalSessionCookieValue(
  cookies: string | readonly string[] | undefined,
): string | undefined {
  if (!cookies) return undefined
  const list = Array.isArray(cookies) ? cookies : [cookies as string]
  const cookie = list.find((entry) => entry.startsWith('__Host-sso-portal-session='))
  return cookie?.split(';')[0]?.split('=').slice(1).join('=')
}

function refreshRequest(sessionCookieValue: string): IncomingMessage {
  const req = new http.IncomingMessage(new net.Socket())
  req.headers.cookie = `__Host-sso-portal-session=${sessionCookieValue}`
  req.push(null)
  return req
}

function callbackUrl(): URL {
  return new URL(`${appBaseUrl}/auth/callback?code=code&state=state`)
}

function getRequest(): IncomingMessage {
  const req = new http.IncomingMessage(new net.Socket())
  req.headers.cookie = transactionCookie({
    state: 'state',
    nonce: 'nonce',
    codeVerifier: 'verifier',
    returnTo: '/home',
  })
  return req
}

function postRequest(body: { readonly code: string; readonly state: string }): IncomingMessage {
  const req = new http.IncomingMessage(new net.Socket())
  req.headers.cookie = transactionCookie({
    state: 'state',
    nonce: 'nonce',
    codeVerifier: 'verifier',
    returnTo: '/home',
  })
  req.push(JSON.stringify(body))
  req.push(null)
  return req
}

function logoutRequest(): IncomingMessage {
  const req = new http.IncomingMessage(new net.Socket())
  req.push(null)
  return req
}

async function tokenFixture(
  options: { readonly omitSid?: boolean } = {},
): Promise<{ readonly token: string; readonly jwk: Record<string, unknown> }> {
  const privateKey: KeyObject = signingKeyPair.privateKey
  const jwk = await exportJWK(signingKeyPair.publicKey)
  const now = Math.floor(Date.now() / 1000)
  const header = base64UrlJson({ alg: 'ES256', kid: 'valid-kid', typ: 'JWT' })
  const payload = base64UrlJson({
    iss: issuer,
    aud: clientId,
    sub: 'user-1',
    nonce: 'nonce',
    iat: now,
    exp: now + 300,
    ...(options.omitSid ? {} : { sid: widgetSid }),
  })
  const signingInput = `${header}.${payload}`
  const signature = createSign('SHA256')
    .update(signingInput)
    .end()
    .sign({ key: privateKey, dsaEncoding: 'ieee-p1363' })

  return {
    token: `${signingInput}.${signature.toString('base64url')}`,
    jwk: { ...jwk, kid: 'valid-kid', alg: 'ES256', use: 'sig' },
  }
}

function mockOidcFetch(fixture: { readonly token: string; readonly jwk: Record<string, unknown> }) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input)

    if (url === `${issuer}/.well-known/openid-configuration`) {
      return jsonResponse({
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: metadataTokenUrl,
        jwks_uri: jwksUrl,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['ES256'],
      })
    }

    if (url === metadataTokenUrl) {
      return jsonResponse({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        id_token: fixture.token,
        expires_in: 300,
      })
    }

    if (url === jwksUrl) return jsonResponse({ keys: [fixture.jwk] })
    if (url === `${issuer}/userinfo`) return jsonResponse(userinfo())

    return new Response('not found', { status: 404 })
  })

  globalThis.fetch = fetchMock as typeof fetch
  return fetchMock
}

function base64UrlJson(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

function userinfo(): Record<string, unknown> {
  return {
    sub: 'user-1',
    email: 'user@example.test',
    name: 'User Example',
    roles: ['user'],
    auth_time: Math.floor(Date.now() / 1000),
    amr: ['pwd'],
    acr: 'urn:sso:loa:pwd',
    last_login_at: new Date().toISOString(),
  }
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
