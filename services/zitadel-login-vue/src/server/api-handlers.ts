import type { IncomingMessage } from 'node:http'
import { performance } from 'node:perf_hooks'

import { LOGIN_MESSAGES } from '../shared/messages.js'
import { sanitizeFlowId, sanitizeLoginName, sanitizeOtpCode, withBasePath } from '../shared/routes.js'
import type { RuntimeConfig } from './config.js'
import { clearSessionCookie, LOGIN_SESSION_COOKIE, parseLoginState, serializeLoginState, sessionCookie } from './cookies.js'
import { readCookie, readJsonBody, RequestBodyError } from './request.js'
import type { AppResponse } from './response.js'
import { json } from './response.js'
import {
  createSession,
  changePassword,
  finalizeAuthRequest,
  findUserIdByLoginName,
  getAuthRequestLoginHint,
  requestPasswordReset,
  updatePassword,
  updateTotp,
  ZitadelApiError,
} from './zitadel-client.js'

export async function handleApi(request: IncomingMessage, action: string, config: RuntimeConfig): Promise<AppResponse> {
  const started = performance.now()
  try {
    return withApiTiming(await dispatchApi(request, action, config), started)
  } catch (error) {
    logApiError(action, error, started)
    return withApiTiming(errorResponse(error), started)
  }
}

function dispatchApi(request: IncomingMessage, action: string, config: RuntimeConfig): Promise<AppResponse> | AppResponse {
  if (action === '/session/auth-request') return handleAuthRequest(request, config)
  if (action === '/session/user') return handleUser(request, config)
  if (action === '/session/password') return handlePassword(request, config)
  if (action === '/session/totp') return handleTotp(request, config)
  if (action === '/session/clear') return clearSession(config)
  if (action === '/password-reset/request') return handlePasswordResetRequest(request, config)
  if (action === '/password-reset/change') return handlePasswordChange(request, config)
  return json(404, { error: 'not_found' })
}

async function handleAuthRequest(request: IncomingMessage, config: RuntimeConfig): Promise<AppResponse> {
  const authRequest = sanitizeFlowId(authRequestFromBody(await readJsonBody(request)))
  if (!authRequest) return json(422, { message: LOGIN_MESSAGES.missingFlow })
  const loginName = sanitizeLoginName(await getAuthRequestLoginHint(config, authRequest))
  if (!loginName) return json(200, { nextStep: 'login' })
  return await createIdentifiedSession(config, loginName, authRequest)
}

async function handleUser(request: IncomingMessage, config: RuntimeConfig): Promise<AppResponse> {
  const body = (await readJsonBody(request)) as Record<string, unknown>
  const loginName = sanitizeLoginName(body.loginName)
  if (!loginName) return json(422, { message: LOGIN_MESSAGES.invalidLoginName })
  const authRequest = sanitizeFlowId(body.authRequest)
  return await createIdentifiedSession(config, loginName, authRequest ?? undefined)
}

async function createIdentifiedSession(config: RuntimeConfig, loginName: string, authRequest?: string): Promise<AppResponse> {
  const session = await createSession(config, loginName)
  const value = serializeLoginState({ ...session, loginName, authRequest: authRequest ?? undefined }, config)
  return json(200, { nextStep: 'password', loginName }, { 'set-cookie': sessionCookie(value, config) })
}

async function handlePassword(request: IncomingMessage, config: RuntimeConfig): Promise<AppResponse> {
  const state = getState(request, config)
  const password = passwordFromBody(await readJsonBody(request))
  if (!password) return json(422, { message: LOGIN_MESSAGES.invalidPassword })
  const sessionToken = await updatePassword(config, state.sessionId, password)
  return await continueAfterPassword(config, { ...state, sessionToken })
}

async function handleTotp(request: IncomingMessage, config: RuntimeConfig): Promise<AppResponse> {
  const state = getState(request, config)
  const code = sanitizeOtpCode((await readJsonBody(request) as Record<string, unknown>).code)
  if (code.length < 6) return json(422, { message: LOGIN_MESSAGES.invalidOtp })
  const sessionToken = await updateTotp(config, state.sessionId, code)
  return await finalizeOrContinue(config, { ...state, sessionToken }, 'signedin')
}

async function handlePasswordResetRequest(request: IncomingMessage, config: RuntimeConfig): Promise<AppResponse> {
  const loginName = sanitizeLoginName((await readJsonBody(request) as Record<string, unknown>).loginName)
  if (!loginName) return json(422, { message: LOGIN_MESSAGES.invalidLoginName })
  await sendPasswordResetIfUserExists(config, loginName)
  return json(200, { message: LOGIN_MESSAGES.passwordResetRequested })
}

async function handlePasswordChange(request: IncomingMessage, config: RuntimeConfig): Promise<AppResponse> {
  const body = await readJsonBody(request) as Record<string, unknown>
  const userId = sanitizeFlowId(body.userId)
  const code = sanitizeFlowId(body.code)
  const password = passwordFromBody(body)
  if (!userId || !code || !password) return json(422, { message: LOGIN_MESSAGES.invalidPasswordReset })
  await changePassword(config, userId, password, code)
  return json(200, { message: LOGIN_MESSAGES.passwordResetChanged })
}

async function finalizeOrContinue(config: RuntimeConfig, state: ReturnType<typeof getState>, fallbackStep: string) {
  const value = serializeLoginState(state, config)
  if (!state.authRequest) return json(200, { nextStep: fallbackStep }, { 'set-cookie': sessionCookie(value, config) })

  try {
    const redirectUrl = await finalizeAuthRequest(config, state.authRequest, state.sessionId, state.sessionToken)
    return json(200, { redirectUrl }, { 'set-cookie': clearSessionCookie(config) })
  } catch (error) {
    if (error instanceof ZitadelApiError && error.status < 500) {
      return json(200, { nextStep: fallbackStep }, { 'set-cookie': sessionCookie(value, config) })
    }
    throw error
  }
}

async function continueAfterPassword(config: RuntimeConfig, state: ReturnType<typeof getState>) {
  if (config.requireTotpAfterPassword) {
    const value = serializeLoginState(state, config)
    return json(200, { nextStep: 'otp' }, { 'set-cookie': sessionCookie(value, config) })
  }

  return await finalizeOrContinue(config, state, 'otp')
}

function getState(request: IncomingMessage, config: RuntimeConfig) {
  const value = readCookie(request, LOGIN_SESSION_COOKIE)
  const state = parseLoginState(value, config)
  if (!state) throw new ZitadelApiError(401, 'missing_session', LOGIN_MESSAGES.missingSession)
  return state
}

function passwordFromBody(body: unknown): string {
  if (typeof body !== 'object' || body === null) return ''
  const password = (body as Record<string, unknown>).password
  return typeof password === 'string' ? password : ''
}

function authRequestFromBody(body: unknown): unknown {
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>).authRequest : null
}

function clearSession(config: RuntimeConfig): AppResponse {
  return json(200, { ok: true }, { 'set-cookie': clearSessionCookie(config) })
}

async function sendPasswordResetIfUserExists(config: RuntimeConfig, loginName: string): Promise<void> {
  try {
    const userId = await findUserIdByLoginName(config, loginName)
    if (userId) await requestPasswordReset(config, userId, passwordResetTemplate(config))
  } catch (error) {
    console.error('Password reset request failed:', error instanceof Error ? error.message : error)
  }
}

function passwordResetTemplate(config: RuntimeConfig): string {
  return `https://${config.publicHost}${withBasePath(config.publicBasePath, '/password/change')}?userID={{.UserID}}&code={{.Code}}&orgID={{.OrgID}}`
}

function errorResponse(error: unknown): AppResponse {
  if (error instanceof RequestBodyError) return json(error.status, { message: LOGIN_MESSAGES.generic })
  if (error instanceof ZitadelApiError) {
    return json(errorStatus(error), { message: messageForError(error) }, errorHeaders(error))
  }
  return json(500, { message: LOGIN_MESSAGES.generic })
}

function logApiError(action: string, error: unknown, started: number): void {
  if (error instanceof ZitadelApiError && error.status < 500) return

  const status = error instanceof ZitadelApiError ? error.status : 500
  const code = error instanceof ZitadelApiError ? error.code : errorName(error)
  const durationMs = Math.max(0, performance.now() - started).toFixed(1)
  console.error(`login_api_error action=${action} status=${status} code=${code} duration_ms=${durationMs}`)
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown_error'
}

function errorHeaders(error: ZitadelApiError): Record<string, string> {
  if (error.status < 500) return { 'cache-control': 'no-store' }
  return { 'cache-control': 'no-store', 'retry-after': '3' }
}

function errorStatus(error: ZitadelApiError): number {
  if (error.status === 401 || error.status === 403) return 401
  if (error.status === 404) return 404
  if (error.status < 500) return 422
  return 503
}

function messageForError(error: ZitadelApiError): string {
  if (error.code.includes('password') || error.code.includes('user')) return LOGIN_MESSAGES.invalidCredentials
  if (error.code.includes('otp') || error.code.includes('totp')) return LOGIN_MESSAGES.invalidOtpCode
  if (error.code === 'missing_session') return LOGIN_MESSAGES.missingSession
  return error.status >= 500 ? LOGIN_MESSAGES.serviceUnavailable : LOGIN_MESSAGES.generic
}

function withApiTiming(response: AppResponse, started: number): AppResponse {
  const duration = Math.max(0, performance.now() - started).toFixed(1)
  return { ...response, headers: { ...response.headers, 'server-timing': `login_api;dur=${duration}` } }
}
