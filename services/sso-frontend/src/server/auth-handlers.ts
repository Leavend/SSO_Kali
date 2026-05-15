import type { IncomingMessage } from 'node:http'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import {
  ACCESS_DENIED_ROUTE,
  HANDSHAKE_FAILED_ROUTE,
  INVALID_CREDENTIALS_ROUTE,
  MFA_REQUIRED_ROUTE,
  REAUTH_REQUIRED_ROUTE,
  TOO_MANY_ATTEMPTS_ROUTE,
} from '../shared/auth-status.js'
import { fetchPrincipalWithAccessToken } from './admin-api.js'
import {
  isAdminApiError,
  isMfaRequiredApiError,
  isReauthRequiredApiError,
  isTooManyAttemptsApiError,
} from './admin-api-error.js'
import type { AdminConfig } from './config.js'
import { getConfig } from './config.js'
import { fetchDiscovery, type DiscoveryMetadata } from '../lib/oidc/discovery.js'
import {
  clearSessionCookie,
  clearTransactionCookie,
  pullTransaction,
  readSession,
  sessionCookie,
  sessionFromBootstrap,
  transactionCookie,
} from './session.js'
import type { AdminSession } from './session.js'
import { refreshAdminSession, sessionNeedsRefresh } from './session-refresh.js'
import type { AppResponse } from './response.js'
import { json, redirect } from './response.js'
import {
  buildAuthorizeUrl,
  generateCodeChallenge,
  generateCodeVerifier,
  generateNonce,
  generateState,
} from './pkce.js'

const jwksByUrl = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

export async function handleLogin(requestUrl: URL): Promise<AppResponse> {
  const state = generateState()
  const nonce = generateNonce()
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)
  const returnTo = normalizeReturnTo(requestUrl.searchParams.get('return_to'))
  const loginHint = requestUrl.searchParams.get('login_hint')

  const discovery = await fetchValidatedDiscoveryMetadata()
  const location = buildAuthorizeUrl({
    state,
    nonce,
    codeChallenge,
    authorizationEndpoint: discovery.authorization_endpoint,
    ...(loginHint ? { loginHint } : {}),
  })

  return redirect(location, [
    transactionCookie({
      state,
      nonce,
      codeVerifier,
      ...(returnTo ? { returnTo } : {}),
    }),
  ])
}

export async function handleCallback(request: IncomingMessage, requestUrl: URL): Promise<AppResponse> {
  const config = getConfig()
  const params = readCallbackParams(requestUrl)
  const earlyRoute = validateCallback(params)
  if (earlyRoute) return redirect(new URL(earlyRoute, config.appBaseUrl).toString())
  if (!params.code || !params.state) return redirectWithClearedTx(config, HANDSHAKE_FAILED_ROUTE)

  const receivedIssuer = requestUrl.searchParams.get('iss')
  if (receivedIssuer && receivedIssuer !== config.issuer) {
    return redirectWithClearedTx(config, HANDSHAKE_FAILED_ROUTE)
  }

  const result = await completeCallbackSession(request, params.code, params.state)
  if (!result.ok) return redirectWithClearedTx(config, callbackErrorRoute(result.error))

  return redirect(new URL(result.returnTo, config.appBaseUrl).toString(), [
    sessionCookie(result.session),
    clearTransactionCookie(),
  ])
}

export async function handleCallbackSession(request: IncomingMessage): Promise<AppResponse> {
  const body = await readJsonBody(request)
  const code = typeof body.code === 'string' ? body.code : null
  const state = typeof body.state === 'string' ? body.state : null

  if (!code || !state) {
    return json(422, { error: 'missing_params', message: 'Parameter code atau state tidak ditemukan.' }, {
      'set-cookie': [clearTransactionCookie()],
    })
  }

  const result = await completeCallbackSession(request, code, state)
  if (!result.ok) {
    return json(401, { error: 'callback_failed', message: 'Gagal menyiapkan sesi aman.' }, {
      'set-cookie': [clearTransactionCookie()],
    })
  }

  return json(
    200,
    {
      authenticated: true,
      post_login_redirect: result.returnTo,
    },
    { 'set-cookie': [sessionCookie(result.session), clearTransactionCookie()] },
  )
}

export async function handleLogout(request: IncomingMessage): Promise<AppResponse> {
  const config = getConfig()
  const rawSession = readSession(request)
  const session = rawSession ? await refreshSessionForLogout(rawSession) : null
  const refreshToken = session?.refreshToken ?? rawSession?.refreshToken
  const revocations: Array<Promise<void>> = []

  if (session) revocations.push(revokeSession(config.internalLogoutUrl, session.accessToken))
  if (refreshToken) revocations.push(revokeRefreshToken(config, refreshToken))
  if (revocations.length > 0) await Promise.allSettled(revocations)

  return redirect(new URL('/', config.appBaseUrl).toString(), [clearSessionCookie(), clearTransactionCookie()])
}

export async function handleRefresh(request: IncomingMessage): Promise<AppResponse> {
  const session = readSession(request)

  if (!session?.refreshToken) {
    return json(
      401,
      { error: 'no_session', message: 'No active session or refresh token.' },
      { 'set-cookie': [clearSessionCookie()] },
    )
  }

  try {
    if (!sessionNeedsRefresh(session)) return refreshResponse(session)

    const refreshedSession = await refreshAdminSession(session)

    return refreshResponse(refreshedSession)
  } catch (error) {
    console.error('Token refresh failed:', error instanceof Error ? error.message : error)
    return json(401, { error: 'refresh_failed', message: 'Token refresh failed.' }, { 'set-cookie': [clearSessionCookie()] })
  }
}

function refreshResponse(session: AdminSession): AppResponse {
  return json(
    200,
    {
      status: 'refreshed',
      expiresAt: session.expiresAt,
    },
    { 'set-cookie': [sessionCookie(session)] },
  )
}

async function refreshSessionForLogout(session: AdminSession): Promise<AdminSession | null> {
  if (!sessionNeedsRefresh(session, 30)) return session

  try {
    return await refreshAdminSession(session)
  } catch (error) {
    console.error('Token refresh before logout failed:', error instanceof Error ? error.message : error)
    return sessionNeedsRefresh(session, 0) ? null : session
  }
}

function readCallbackParams(requestUrl: URL): {
  readonly code: string | null
  readonly error: string | null
  readonly state: string | null
} {
  return {
    code: requestUrl.searchParams.get('code'),
    error: requestUrl.searchParams.get('error'),
    state: requestUrl.searchParams.get('state'),
  }
}

function validateCallback(params: ReturnType<typeof readCallbackParams>): string | null {
  if (params.error) return providerErrorRoute(params.error)
  if (typeof params.state !== 'string' || typeof params.code !== 'string') return HANDSHAKE_FAILED_ROUTE
  return null
}

function providerErrorRoute(error: string): string {
  switch (error) {
    case 'mfa_required':
      return MFA_REQUIRED_ROUTE
    case 'too_many_attempts':
      return TOO_MANY_ATTEMPTS_ROUTE
    case 'invalid_request':
    case 'temporarily_unavailable':
    case 'server_error':
      return HANDSHAKE_FAILED_ROUTE
    default:
      return INVALID_CREDENTIALS_ROUTE
  }
}

function callbackErrorRoute(error: unknown): string {
  if (isMfaRequiredApiError(error)) return MFA_REQUIRED_ROUTE
  if (isReauthRequiredApiError(error)) return REAUTH_REQUIRED_ROUTE
  if (isTooManyAttemptsApiError(error)) return TOO_MANY_ATTEMPTS_ROUTE
  if (isAdminApiError(error) && error.status === 403) return ACCESS_DENIED_ROUTE
  return HANDSHAKE_FAILED_ROUTE
}

function redirectWithClearedTx(config: AdminConfig, route: string): AppResponse {
  return redirect(new URL(route, config.appBaseUrl).toString(), [clearTransactionCookie()])
}

type CallbackSessionResult =
  | { readonly ok: true; readonly session: AdminSession; readonly returnTo: string }
  | { readonly ok: false; readonly error: unknown }

type TokenSet = {
  readonly access_token: string
  readonly id_token: string
  readonly refresh_token: string
  readonly expires_in: number
}

async function completeCallbackSession(
  request: IncomingMessage,
  code: string,
  state: string,
): Promise<CallbackSessionResult> {
  const tx = pullTransaction(request)
  if (!tx || tx.state !== state) return { ok: false, error: new Error('OIDC callback transaction mismatch.') }

  let verifiedSubjectId: string | null = null

  try {
    const discovery = await fetchValidatedDiscoveryMetadata()
    const tokens = await exchangeCode(discovery, code, tx.codeVerifier)
    const claims = await verifyIdToken(tokens.id_token, tx.nonce, discovery)
    verifiedSubjectId = claims.sub
    const principal = await fetchPrincipalWithAccessToken(tokens.access_token)

    if (principal.subject_id !== claims.sub) {
      throw new Error('Admin principal subject does not match the verified ID token subject.')
    }

    return {
      ok: true,
      returnTo: normalizeReturnTo(tx.returnTo) ?? '/home',
      session: sessionFromBootstrap(
        {
          accessToken: tokens.access_token,
          idToken: tokens.id_token,
          refreshToken: tokens.refresh_token,
          expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
        },
        principal,
      ),
    }
  } catch (error) {
    logCallbackFailure(error, verifiedSubjectId)
    return { ok: false, error }
  }
}

async function exchangeCode(discovery: DiscoveryMetadata, code: string, codeVerifier: string): Promise<TokenSet> {
  const config = getConfig()
  const res = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      code,
      redirect_uri: config.redirectUri,
      code_verifier: codeVerifier,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Token exchange failed: HTTP ${res.status} - ${body}`)
  }

  return res.json() as Promise<TokenSet>
}

async function fetchValidatedDiscoveryMetadata(): Promise<DiscoveryMetadata> {
  const config = getConfig()
  const metadata = await fetchDiscovery(`${config.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`)

  if (metadata.issuer !== config.issuer) {
    throw new Error('Discovery issuer mismatch.')
  }

  assertValidHttpsUrl(metadata.authorization_endpoint, 'Discovery authorization endpoint invalid.')
  assertValidHttpsUrl(metadata.token_endpoint, 'Discovery token endpoint invalid.')
  assertValidHttpsUrl(metadata.jwks_uri, 'Discovery JWKS URI invalid.')

  return metadata
}

function assertValidHttpsUrl(value: string, message: string): void {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error(message)
  } catch {
    throw new Error(message)
  }
}

async function verifyIdToken(
  token: string,
  expectedNonce: string,
  discovery: DiscoveryMetadata,
): Promise<{ readonly sub: string; readonly exp: number }> {
  const config = getConfig()
  const jwksUrl = discovery.jwks_uri
  let jwks = jwksByUrl.get(jwksUrl)
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUrl))
    jwksByUrl.set(jwksUrl, jwks)
  }

  const { payload } = await jwtVerify(token, jwks, {
    issuer: discovery.issuer,
    audience: config.clientId,
  })

  const sub = payload.sub
  const exp = payload.exp
  const nonce = Reflect.get(payload, 'nonce')

  if (typeof sub !== 'string' || sub === '') throw new Error("ID token is missing a valid 'sub' claim.")
  if (typeof exp !== 'number') throw new Error("ID token is missing a valid 'exp' claim.")
  if (nonce !== expectedNonce) throw new Error('ID token nonce validation failed.')

  return { sub, exp }
}

async function revokeSession(logoutUrl: string, accessToken: string): Promise<void> {
  await fetch(logoutUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(5_000),
  })
}

async function revokeRefreshToken(config: AdminConfig, refreshToken: string): Promise<void> {
  await fetch(config.internalRevocationUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      token: refreshToken,
      token_type_hint: 'refresh_token',
    }),
    signal: AbortSignal.timeout(5_000),
  })
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  if (chunks.length === 0) return {}

  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function normalizeReturnTo(returnTo: string | null | undefined): string | null {
  if (!returnTo || !returnTo.startsWith('/') || returnTo.startsWith('//')) return null
  if (returnTo.startsWith('/auth/login') || returnTo.startsWith('/auth/callback')) return null
  return returnTo
}

function logCallbackFailure(error: unknown, subjectId: string | null): void {
  const payload = {
    event: 'admin_auth_callback_failed',
    subjectId,
    ...serializeCallbackError(error),
  }

  console.error(JSON.stringify(payload))
}

function serializeCallbackError(error: unknown): Record<string, unknown> {
  if (isAdminApiError(error)) {
    return {
      kind: 'admin_api_error',
      status: error.status,
      code: error.code ?? null,
      message: error.message,
    }
  }

  if (error instanceof Error) {
    return {
      kind: 'error',
      name: error.name,
      message: error.message,
    }
  }

  return {
    kind: 'unknown',
    message: String(error),
  }
}
