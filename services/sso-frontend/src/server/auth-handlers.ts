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
import {
  clearSessionCookie,
  clearTransactionCookie,
  getSession,
  pullTransaction,
  sessionCookie,
  sessionFromBootstrap,
  transactionCookie,
} from './session.js'
import type { AppResponse } from './response.js'
import { json, redirect } from './response.js'
import {
  buildAuthorizeUrl,
  generateCodeChallenge,
  generateCodeVerifier,
  generateNonce,
  generateState,
} from './pkce.js'

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null

export async function handleLogin(requestUrl: URL): Promise<AppResponse> {
  const state = generateState()
  const nonce = generateNonce()
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)
  const returnTo = normalizeReturnTo(requestUrl.searchParams.get('return_to'))
  const loginHint = requestUrl.searchParams.get('login_hint')

  const location = buildAuthorizeUrl({
    state,
    nonce,
    codeChallenge,
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

export function handleIdentityUiRedirect(requestUrl: URL, relativePath: string): AppResponse {
  const config = getConfig()
  const target = new URL(relativePath, config.identityUiBaseUrl)
  const loginHint = requestUrl.searchParams.get('login_hint')

  if (loginHint) {
    target.searchParams.set('login_hint', loginHint)
  }

  return redirect(target.toString(), undefined, {
    'cache-control': 'no-store, no-cache, private, max-age=0',
    'x-content-type-options': 'nosniff',
  })
}

export async function handleCallback(request: IncomingMessage, requestUrl: URL): Promise<AppResponse> {
  const config = getConfig()
  const params = readCallbackParams(requestUrl)
  const earlyRoute = validateCallback(params)
  if (earlyRoute) return redirect(new URL(earlyRoute, config.appBaseUrl).toString())
  if (!params.code || !params.state) return redirectWithClearedTx(config, HANDSHAKE_FAILED_ROUTE)

  const tx = pullTransaction(request)
  if (!tx || tx.state !== params.state) {
    return redirectWithClearedTx(config, HANDSHAKE_FAILED_ROUTE)
  }

  let verifiedSubjectId: string | null = null

  try {
    const tokens = await exchangeCode(params.code, tx.codeVerifier)
    const claims = await verifyIdToken(tokens.id_token, tx.nonce)
    verifiedSubjectId = claims.sub
    const principal = await fetchPrincipalWithAccessToken(tokens.access_token)

    if (principal.subject_id !== claims.sub) {
      throw new Error('Admin principal subject does not match the verified ID token subject.')
    }

    const session = sessionFromBootstrap(
      {
        accessToken: tokens.access_token,
        idToken: tokens.id_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
      },
      principal,
    )

    return redirect(new URL(normalizeReturnTo(tx.returnTo) ?? '/dashboard', config.appBaseUrl).toString(), [
      sessionCookie(session),
      clearTransactionCookie(),
    ])
  } catch (error) {
    logCallbackFailure(error, verifiedSubjectId)
    return redirectWithClearedTx(config, callbackErrorRoute(error))
  }
}

export async function handleLogout(request: IncomingMessage): Promise<AppResponse> {
  const config = getConfig()
  const session = getSession(request)

  if (session) {
    await Promise.allSettled([
      revokeSession(config.internalLogoutUrl, session.accessToken),
      revokeRefreshToken(config, session.refreshToken),
    ])
  }

  return redirect(new URL('/', config.appBaseUrl).toString(), [clearSessionCookie(), clearTransactionCookie()])
}

export async function handleRefresh(request: IncomingMessage): Promise<AppResponse> {
  const session = getSession(request)

  if (!session?.refreshToken) {
    return json(
      401,
      { error: 'no_session', message: 'No active session or refresh token.' },
      { 'set-cookie': [clearSessionCookie()] },
    )
  }

  try {
    const tokens = await refreshTokens(session.refreshToken)
    const refreshedSession = {
      ...session,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? session.refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
    }

    return json(
      200,
      {
        status: 'refreshed',
        expiresAt: refreshedSession.expiresAt,
      },
      { 'set-cookie': [sessionCookie(refreshedSession)] },
    )
  } catch (error) {
    console.error('Token refresh failed:', error instanceof Error ? error.message : error)
    return json(401, { error: 'refresh_failed', message: 'Token refresh failed.' }, { 'set-cookie': [clearSessionCookie()] })
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

type TokenSet = {
  readonly access_token: string
  readonly id_token: string
  readonly refresh_token: string
  readonly expires_in: number
}

async function exchangeCode(code: string, codeVerifier: string): Promise<TokenSet> {
  const config = getConfig()
  const res = await fetch(config.tokenUrl, {
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

async function verifyIdToken(token: string, expectedNonce: string): Promise<{ readonly sub: string; readonly exp: number }> {
  const config = getConfig()
  jwks ??= createRemoteJWKSet(new URL(config.jwksUrl))
  const { payload } = await jwtVerify(token, jwks, {
    issuer: config.issuer,
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

async function refreshTokens(refreshToken: string): Promise<{
  readonly access_token: string
  readonly refresh_token?: string
  readonly expires_in: number
}> {
  const config = getConfig()
  const res = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Refresh failed: HTTP ${res.status} - ${body}`)
  }

  return res.json() as Promise<{
    readonly access_token: string
    readonly refresh_token?: string
    readonly expires_in: number
  }>
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
