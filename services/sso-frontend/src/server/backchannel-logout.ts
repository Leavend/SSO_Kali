import type { IncomingMessage } from 'node:http'
import type { AppResponse } from './response.js'
import { json } from './response.js'
import { clearSessionCookie, readSession } from './session.js'
import {
  deleteSessionRecord,
  findSessionRecordIdsBySid,
  findSessionRecordIdsBySubject,
} from './session-store.js'
import { getConfig } from './config.js'
import { fetchDiscovery, type DiscoveryMetadata } from '../lib/oidc/discovery.js'
import { createRemoteJWKSet, jwtVerify } from 'jose'

type LogoutClaims = {
  readonly sub?: string
  readonly sid?: string
  readonly aud?: string | readonly string[]
  readonly iss?: string
  readonly jti?: string
  readonly events?: Record<string, unknown>
}

const jwksByUrl = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

export async function handleBackChannelLogout(request: IncomingMessage): Promise<AppResponse> {
  const token = await readLogoutToken(request)
  if (!token) {
    return json(400, { error: 'invalid_request', message: 'logout_token is required.' })
  }

  try {
    const claims = await verifyLogoutToken(token)
    const revoked = await revokePortalSessions(claims)
    const currentSession = await readSession(request)
    const headers = currentSession ? { 'set-cookie': await clearSessionCookie(request) } : undefined

    return json(
      200,
      {
        logged_out: true,
        client_id: getConfig().clientId,
        sessions_revoked: revoked,
      },
      headers,
    )
  } catch (error) {
    console.error(
      'Portal back-channel logout failed:',
      error instanceof Error ? error.message : error,
    )
    return json(400, { error: 'invalid_request', message: 'The logout token is invalid.' })
  }
}

async function readLogoutToken(request: IncomingMessage): Promise<string | null> {
  const body = await readFormBody(request)
  const token = body.get('logout_token')
  return typeof token === 'string' && token !== '' ? token : null
}

async function verifyLogoutToken(token: string): Promise<LogoutClaims> {
  const discovery = await fetchValidatedDiscoveryMetadata()
  const jwks = getJwks(discovery.jwks_uri)
  const { payload } = await jwtVerify(token, jwks, {
    issuer: discovery.issuer,
    audience: getConfig().clientId,
  })

  const nonce = Reflect.get(payload, 'nonce')
  if (nonce !== undefined) {
    throw new Error('Logout token nonce is not allowed.')
  }

  const events = Reflect.get(payload, 'events')
  if (
    !events ||
    typeof events !== 'object' ||
    !Object.prototype.hasOwnProperty.call(events, 'http://schemas.openid.net/event/backchannel-logout')
  ) {
    throw new Error('Logout token event is missing.')
  }

  const sub = typeof payload.sub === 'string' && payload.sub !== '' ? payload.sub : undefined
  const sid = typeof Reflect.get(payload, 'sid') === 'string' ? (Reflect.get(payload, 'sid') as string) : undefined
  if (!sub && !sid) {
    throw new Error('Logout token subject is missing.')
  }

  return payload as LogoutClaims
}

function getJwks(jwksUrl: string): ReturnType<typeof createRemoteJWKSet> {
  let jwks = jwksByUrl.get(jwksUrl)
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUrl))
    jwksByUrl.set(jwksUrl, jwks)
  }
  return jwks
}

async function fetchValidatedDiscoveryMetadata(): Promise<DiscoveryMetadata> {
  const config = getConfig()
  const metadata = await fetchDiscovery(
    `${config.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`,
  )

  if (metadata.issuer !== config.issuer) {
    throw new Error('Discovery issuer mismatch.')
  }

  return metadata
}

async function revokePortalSessions(claims: LogoutClaims): Promise<number> {
  const ids = new Set<string>()

  if (typeof claims.sid === 'string') {
    for (const sessionId of await findSessionRecordIdsBySid(claims.sid)) {
      ids.add(sessionId)
    }
  }

  if (typeof claims.sub === 'string') {
    for (const sessionId of await findSessionRecordIdsBySubject(claims.sub)) {
      ids.add(sessionId)
    }
  }

  for (const sessionId of ids) {
    await deleteSessionRecord(sessionId)
  }

  return ids.size
}

async function readFormBody(request: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = []

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
}
