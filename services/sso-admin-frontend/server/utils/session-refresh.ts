import { getConfig } from './config'
import type { PortalSession } from './session'
import { isSessionExpired, unixTime } from './session'
import { fetchPrincipalWithAccessToken } from './user-api'

export type RefreshRequestContext = {
  readonly requestId: string
}

type RefreshTokenSet = {
  readonly access_token: string
  readonly refresh_token?: string
  readonly expires_in: number
}

export function sessionNeedsRefresh(session: PortalSession, bufferSeconds = 180): boolean {
  return isSessionExpired(session.expiresAt, bufferSeconds)
}

export async function refreshPortalSession(
  session: PortalSession,
  context?: RefreshRequestContext,
): Promise<PortalSession> {
  const tokens = await requestRefreshTokens(session.refreshToken, context)
  const refreshedAt = unixTime()
  const principal = await fetchPrincipalWithAccessToken(tokens.access_token, context).catch(
    () => null,
  )

  return {
    ...session,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? session.refreshToken,
    expiresAt: refreshedAt + tokens.expires_in,
    lastRefreshedAt: refreshedAt,
    role: principal?.role ?? session.role,
  }
}

async function requestRefreshTokens(
  refreshToken: string,
  context?: RefreshRequestContext,
): Promise<RefreshTokenSet> {
  const config = getConfig()
  const res = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept-Encoding': 'identity',
      ...(context ? { 'X-Request-Id': context.requestId } : {}),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: requiredClientSecret(config.clientSecret),
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) throw new Error(`Refresh failed: HTTP ${res.status} - ${await safeText(res)}`)
  return res.json() as Promise<RefreshTokenSet>
}

function requiredClientSecret(secret: string | null): string {
  if (secret) return secret

  throw new Error('ADMIN_OIDC_CLIENT_SECRET is required for confidential OIDC client operations.')
}

async function safeText(response: Response): Promise<string> {
  return response.text().catch(() => '')
}
