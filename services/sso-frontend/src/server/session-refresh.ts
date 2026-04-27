import { getConfig } from './config.js'
import type { AdminSession } from './session.js'
import { isSessionExpired } from './session.js'

type RefreshTokenSet = {
  readonly access_token: string
  readonly refresh_token?: string
  readonly expires_in: number
}

export function sessionNeedsRefresh(session: AdminSession, bufferSeconds = 180): boolean {
  return isSessionExpired(session.expiresAt, bufferSeconds)
}

export async function refreshAdminSession(session: AdminSession): Promise<AdminSession> {
  const tokens = await requestRefreshTokens(session.refreshToken)

  return {
    ...session,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? session.refreshToken,
    expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
  }
}

async function requestRefreshTokens(refreshToken: string): Promise<RefreshTokenSet> {
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

  if (!res.ok) throw new Error(`Refresh failed: HTTP ${res.status} - ${await safeText(res)}`)
  return res.json() as Promise<RefreshTokenSet>
}

async function safeText(response: Response): Promise<string> {
  return response.text().catch(() => '')
}
