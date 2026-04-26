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

export async function createSession(config: RuntimeConfig, loginName: string): Promise<Required<SessionTokenResponse>> {
  const body = { checks: { user: { loginName } } }
  const response = await zitadelJson<SessionTokenResponse>(config, '/v2/sessions', 'POST', body)
  if (!response.sessionId) throw new ZitadelApiError(502, 'missing_session_id', 'ZITADEL did not return sessionId')
  return { sessionId: response.sessionId, sessionToken: response.sessionToken }
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

async function zitadelJson<T>(config: RuntimeConfig, path: string, method: string, body: unknown): Promise<T> {
  const response = await fetch(`${config.apiUrl}${path}`, await requestInit(config, method, body))
  const payload = await parsePayload(response)
  if (!response.ok) throw toZitadelError(response.status, payload)
  return payload as T
}

async function requestInit(config: RuntimeConfig, method: string, body: unknown): Promise<RequestInit> {
  return {
    method,
    headers: await requestHeaders(config),
    body: JSON.stringify(body),
  }
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

function codeFromPayload(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) return 'zitadel_error'
  const record = payload as Record<string, unknown>
  return String(record.code || record.message || record.error || 'zitadel_error')
}
