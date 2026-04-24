import type { ApiClient, ApiSession, ApiUser, AdminPrincipal } from '../shared/admin.js'
import { getConfig } from './config.js'
import { buildAdminApiError } from './admin-api-error.js'
import type { AdminSession } from './session.js'

type AccessToken = string

export async function fetchUsers(session: AdminSession): Promise<ApiUser[]> {
  const data = await adminFetch<{ users: ApiUser[] }>('/users', session)
  return data.users
}

export async function fetchPrincipal(session: AdminSession): Promise<AdminPrincipal> {
  return fetchPrincipalWithAccessToken(session.accessToken)
}

export async function fetchPrincipalWithAccessToken(accessToken: string): Promise<AdminPrincipal> {
  const data = await adminFetchWithToken<{ principal: AdminPrincipal }>('/me', accessToken)
  return data.principal
}

export async function fetchUser(
  session: AdminSession,
  subjectId: string,
): Promise<{
  readonly user: ApiUser
  readonly sessions: ApiSession[]
}> {
  return adminFetch(`/users/${encodeURIComponent(subjectId)}`, session)
}

export async function fetchSessions(session: AdminSession): Promise<ApiSession[]> {
  const data = await adminFetch<{ sessions: ApiSession[] }>('/sessions', session)
  return data.sessions
}

export async function fetchClients(session: AdminSession): Promise<ApiClient[]> {
  const data = await adminFetch<{ clients: ApiClient[] }>('/clients', session)
  return data.clients
}

export async function revokeSession(session: AdminSession, sessionId: string): Promise<void> {
  await adminFetch(`/sessions/${encodeURIComponent(sessionId)}`, session, { method: 'DELETE' })
}

export async function revokeUserSessions(session: AdminSession, subjectId: string): Promise<void> {
  await adminFetch(`/users/${encodeURIComponent(subjectId)}/sessions`, session, { method: 'DELETE' })
}

async function adminFetch<T>(path: string, session: AdminSession, init?: RequestInit): Promise<T> {
  return adminFetchWithToken(path, session.accessToken, init)
}

async function adminFetchWithToken<T>(
  path: string,
  accessToken: AccessToken,
  init?: RequestInit,
): Promise<T> {
  const config = getConfig()
  const res = await fetch(`${config.adminApiUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...init?.headers,
    },
  })

  if (!res.ok) {
    throw await buildAdminApiError(res)
  }

  return res.json() as Promise<T>
}
