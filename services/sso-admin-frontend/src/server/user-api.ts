import type {
  ConnectedApp,
  ProfileUpdatePayload,
  SsoAuthContext,
  SsoPrincipal,
  UserProfile,
  UserSessionSummary,
} from '../shared/user.js'
import type { PortalSession } from './session.js'
import { getConfig } from './config.js'
import { buildUserApiError } from './user-api-error.js'

type AccessToken = string
export type BackendRequestContext = {
  readonly requestId: string
}

type UserInfoResponse = {
  readonly sub: string
  readonly email?: string
  readonly email_verified?: boolean
  readonly name?: string
  readonly preferred_username?: string
  readonly role?: string
  readonly roles?: readonly string[]
  readonly auth_time?: number
  readonly amr?: readonly string[]
  readonly acr?: string
  readonly last_login_at?: string | null
}

export async function fetchPrincipalWithAccessToken(
  accessToken: string,
  context?: BackendRequestContext,
): Promise<SsoPrincipal> {
  const userinfo = await userinfoFetch<UserInfoResponse>(accessToken, context)

  return principalFromUserInfo(userinfo)
}

export async function fetchProfile(
  session: PortalSession,
  context: BackendRequestContext,
): Promise<UserProfile> {
  return profileFetch<UserProfile>('/', session.accessToken, context)
}

export async function updateProfile(
  session: PortalSession,
  payload: ProfileUpdatePayload,
  context: BackendRequestContext,
): Promise<UserProfile> {
  return profileFetch<UserProfile>('/', session.accessToken, context, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function fetchConnectedApps(
  session: PortalSession,
  context: BackendRequestContext,
): Promise<readonly ConnectedApp[]> {
  const data = await profileFetch<{ connected_apps: ConnectedApp[] }>(
    '/connected-apps',
    session.accessToken,
    context,
  )
  return data.connected_apps
}

export async function revokeConnectedApp(
  session: PortalSession,
  clientId: string,
  context: BackendRequestContext,
): Promise<void> {
  await profileFetch(
    `/connected-apps/${encodeURIComponent(clientId)}`,
    session.accessToken,
    context,
    {
      method: 'DELETE',
    },
  )
}

export async function fetchMySessions(
  session: PortalSession,
  context: BackendRequestContext,
): Promise<readonly UserSessionSummary[]> {
  const data = await profileFetch<{ sessions: UserSessionSummary[] }>(
    '/sessions',
    session.accessToken,
    context,
  )
  return data.sessions
}

export async function revokeMySession(
  session: PortalSession,
  sessionId: string,
  context: BackendRequestContext,
): Promise<void> {
  await profileFetch(`/sessions/${encodeURIComponent(sessionId)}`, session.accessToken, context, {
    method: 'DELETE',
  })
}

async function profileFetch<T>(
  path: string,
  accessToken: AccessToken,
  context: BackendRequestContext,
  init?: RequestInit,
): Promise<T> {
  const config = getConfig()
  const url = `${trimTrailingSlash(config.internalBaseUrl)}/api/profile${path === '/' ? '' : path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Accept-Encoding': 'identity',
      'X-Request-Id': context.requestId,
      ...init?.headers,
    },
  })

  if (!res.ok) throw await buildUserApiError(res)

  return res.json() as Promise<T>
}

async function userinfoFetch<T>(
  accessToken: AccessToken,
  context?: BackendRequestContext,
): Promise<T> {
  const config = getConfig()
  const res = await fetch(`${config.issuer}/userinfo`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Accept-Encoding': 'identity',
      ...(context ? { 'X-Request-Id': context.requestId } : {}),
    },
  })

  if (!res.ok) throw await buildUserApiError(res)

  return res.json() as Promise<T>
}

function principalFromUserInfo(info: UserInfoResponse): SsoPrincipal {
  const authContext: SsoAuthContext = {
    auth_time: info.auth_time ?? null,
    amr: info.amr ? [...info.amr] : [],
    acr: info.acr ?? null,
  }

  const role = info.role ?? info.roles?.[0] ?? 'user'

  return {
    subjectId: info.sub,
    email: info.email ?? '',
    displayName: info.name ?? info.preferred_username ?? info.email ?? info.sub,
    role,
    expiresAt: 0,
    authContext,
    lastLoginAt: info.last_login_at ?? null,
  }
}

function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}
