import type { RuntimeConfig } from './config.js'
import { getServiceToken } from './config.js'

export class ZitadelApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

interface SessionTokenResponse {
  readonly sessionId?: string
  readonly sessionToken: string
}

interface FinalizeResponse {
  readonly callbackUrl?: string
}

interface AuthRequestResponse {
  readonly authRequest?: {
    readonly loginHint?: string
  }
}

interface UserListResponse {
  readonly result?: readonly UserResult[]
}

interface UserResult {
  readonly userId?: string
}

export async function createSession(config: RuntimeConfig, loginName: string): Promise<Required<SessionTokenResponse>> {
  const body = { checks: { user: { loginName } } }
  const response = await zitadelJson<SessionTokenResponse>(config, '/v2/sessions', 'POST', body)
  if (!response.sessionId) throw new ZitadelApiError(502, 'missing_session_id', 'ZITADEL did not return sessionId')
  return { sessionId: response.sessionId, sessionToken: response.sessionToken }
}

export async function findUserIdByLoginName(config: RuntimeConfig, loginName: string): Promise<string | null> {
  const response = await zitadelJson<UserListResponse>(config, '/v2/users', 'POST', usersByLoginNameBody(loginName))
  return response.result?.[0]?.userId ?? null
}

export async function getAuthRequestLoginHint(config: RuntimeConfig, authRequest: string): Promise<string> {
  const response = await zitadelJson<AuthRequestResponse>(config, `/v2/oidc/auth_requests/${authRequest}`, 'GET')
  return typeof response.authRequest?.loginHint === 'string' ? response.authRequest.loginHint : ''
}

export async function updatePassword(config: RuntimeConfig, sessionId: string, password: string): Promise<string> {
  const body = { checks: { password: { password } } }
  const response = await zitadelJson<SessionTokenResponse>(config, `/v2/sessions/${sessionId}`, 'PATCH', body)
  return response.sessionToken
}

export async function updateTotp(config: RuntimeConfig, sessionId: string, code: string): Promise<string> {
  const body = { checks: { totp: { code } } }
  const response = await zitadelJson<SessionTokenResponse>(config, `/v2/sessions/${sessionId}`, 'PATCH', body)
  return response.sessionToken
}

export async function requestPasswordReset(config: RuntimeConfig, userId: string, urlTemplate: string): Promise<void> {
  const body = { sendLink: { notificationType: 'NOTIFICATION_TYPE_Email', urlTemplate } }
  await zitadelJson<unknown>(config, `/v2/users/${userId}/password_reset`, 'POST', body)
}

export async function changePassword(
  config: RuntimeConfig,
  userId: string,
  password: string,
  verificationCode: string,
): Promise<void> {
  const body = { newPassword: { password, changeRequired: false }, verificationCode }
  await zitadelJson<unknown>(config, `/v2/users/${userId}/password`, 'POST', body)
}

export async function finalizeAuthRequest(
  config: RuntimeConfig,
  authRequest: string,
  sessionId: string,
  sessionToken: string,
): Promise<string> {
  const body = { session: { sessionId, sessionToken } }
  const response = await zitadelJson<FinalizeResponse>(config, `/v2/oidc/auth_requests/${authRequest}`, 'POST', body)
  if (!response.callbackUrl) throw new ZitadelApiError(502, 'missing_callback_url', 'ZITADEL did not return callbackUrl')
  return response.callbackUrl
}

async function zitadelJson<T>(config: RuntimeConfig, path: string, method: string, body?: unknown): Promise<T> {
  const response = await fetchZitadel(config, path, await requestInit(config, method, body))
  const payload = await parsePayload(response)
  if (!response.ok) throw toZitadelError(response.status, payload)
  return payload as T
}

async function fetchZitadel(config: RuntimeConfig, path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${config.apiUrl}${path}`, { ...init, signal: AbortSignal.timeout(config.apiTimeoutMs) })
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new ZitadelApiError(504, 'zitadel_timeout', 'ZITADEL request timed out')
    }
    throw error
  }
}

async function requestInit(config: RuntimeConfig, method: string, body?: unknown): Promise<RequestInit> {
  const init: RequestInit = {
    method,
    headers: await requestHeaders(config),
  }

  if (body !== undefined) init.body = JSON.stringify(body)
  return init
}

async function requestHeaders(config: RuntimeConfig): Promise<Record<string, string>> {
  return {
    accept: 'application/json',
    authorization: `Bearer ${await getServiceToken(config)}`,
    'content-type': 'application/json',
    'x-zitadel-instance-host': config.instanceHost,
    'x-zitadel-public-host': config.publicHost,
  }
}

async function parsePayload(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return {}
  return JSON.parse(text)
}

function toZitadelError(status: number, payload: unknown): ZitadelApiError {
  const code = codeFromPayload(payload)
  return new ZitadelApiError(status, code, code)
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
}

function usersByLoginNameBody(loginName: string): object {
  return {
    query: { limit: 1 },
    queries: [{ loginNameQuery: { loginName, method: 'TEXT_QUERY_METHOD_EQUALS' } }],
  }
}

function codeFromPayload(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) return 'zitadel_error'
  const record = payload as Record<string, unknown>
  return String(record.code || record.message || record.error || 'zitadel_error')
}
