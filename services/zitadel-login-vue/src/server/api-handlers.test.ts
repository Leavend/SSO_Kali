import { Readable } from 'node:stream'
import type { IncomingMessage } from 'node:http'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { RuntimeConfig } from './config.js'
import { LOGIN_SESSION_COOKIE, serializeLoginState } from './cookies.js'

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  changePassword: vi.fn(),
  finalizeAuthRequest: vi.fn(),
  findUserIdByLoginName: vi.fn(),
  getAuthRequestLoginHint: vi.fn(),
  requestPasswordReset: vi.fn(),
  updatePassword: vi.fn(),
  updateTotp: vi.fn(),
}))

vi.mock('./zitadel-client.js', () => ({
  ZitadelApiError: class ZitadelApiError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
    ) {
      super(message)
    }
  },
  createSession: mocks.createSession,
  changePassword: mocks.changePassword,
  finalizeAuthRequest: mocks.finalizeAuthRequest,
  findUserIdByLoginName: mocks.findUserIdByLoginName,
  getAuthRequestLoginHint: mocks.getAuthRequestLoginHint,
  requestPasswordReset: mocks.requestPasswordReset,
  updatePassword: mocks.updatePassword,
  updateTotp: mocks.updateTotp,
}))

const config: RuntimeConfig = {
  apiUrl: 'http://zitadel-api:8080',
  appBaseUrl: 'https://dev-sso.timeh.my.id',
  cookieSecret: 'test-zitadel-login-vue-cookie-secret-32',
  instanceHost: 'id.dev-sso.timeh.my.id',
  apiTimeoutMs: 6000,
  port: 3010,
  publicBasePath: '/ui/v2/auth',
  publicHost: 'id.dev-sso.timeh.my.id',
  requireTotpAfterPassword: true,
  secureCookies: true,
  token: 'service-token',
}

describe('login API flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createSession.mockResolvedValue({
      sessionId: 'session-id',
      sessionToken: 'identified-session-token',
    })
    mocks.changePassword.mockReset()
    mocks.finalizeAuthRequest.mockReset()
    mocks.findUserIdByLoginName.mockResolvedValue('user-id')
    mocks.getAuthRequestLoginHint.mockResolvedValue('huanamasi123@gmail.com')
    mocks.requestPasswordReset.mockReset()
    mocks.updatePassword.mockResolvedValue('password-session-token')
  })

  it('starts OIDC requests from the auth request login hint without another email step', async () => {
    const response = await handleAuthRequestStep()
    const payload = JSON.parse(String(response.body)) as { loginName?: string; nextStep?: string }

    expect(response.status).toBe(200)
    expect(payload.nextStep).toBe('password')
    expect(payload.loginName).toBe('huanamasi123@gmail.com')
    expect(mocks.getAuthRequestLoginHint).toHaveBeenCalledWith(config, 'V2_370134305323614212')
  })

  it('keeps OIDC auth requests on the OTP step after password verification', async () => {
    const response = await handlePasswordStep()
    const payload = JSON.parse(String(response.body)) as { nextStep?: string }

    expect(response.status).toBe(200)
    expect(payload.nextStep).toBe('otp')
    expect(mocks.finalizeAuthRequest).not.toHaveBeenCalled()
    expect(String(response.headers['set-cookie'])).toContain(LOGIN_SESSION_COOKIE)
  })

  it('requests password reset links without exposing user lookup results', async () => {
    const response = await handleApiStep('/password-reset/request', { loginName: 'huanamasi123@gmail.com' })
    const payload = JSON.parse(String(response.body)) as { message?: string }

    expect(response.status).toBe(200)
    expect(payload.message).toContain('Jika akun ditemukan')
    expect(mocks.findUserIdByLoginName).toHaveBeenCalledWith(config, 'huanamasi123@gmail.com')
    expect(mocks.requestPasswordReset).toHaveBeenCalledWith(
      config,
      'user-id',
      expect.stringContaining('/ui/v2/auth/password/change?userID={{.UserID}}'),
    )
  })

  it('accepts password reset changes through the server-side ZITADEL client', async () => {
    const response = await handleApiStep('/password-reset/change', {
      code: 'RESET123',
      password: 'New-password-123',
      userId: '368655914414112772',
    })

    expect(response.status).toBe(200)
    expect(mocks.changePassword).toHaveBeenCalledWith(
      config,
      '368655914414112772',
      'New-password-123',
      'RESET123',
    )
  })

  it('rejects oversized JSON bodies before calling ZITADEL', async () => {
    const response = await handleApiStep('/session/user', { loginName: 'a'.repeat(20_000) })
    const payload = JSON.parse(String(response.body)) as { message?: string }

    expect(response.status).toBe(413)
    expect(payload.message).toBeTruthy()
    expect(mocks.createSession).not.toHaveBeenCalled()
  })
})

async function handlePasswordStep() {
  const { handleApi } = await import('./api-handlers.js')
  return await handleApi(passwordRequest(), '/session/password', config)
}

async function handleAuthRequestStep() {
  const { handleApi } = await import('./api-handlers.js')
  return await handleApi(requestFromBody({ authRequest: 'V2_370134305323614212' }), '/session/auth-request', config)
}

async function handleApiStep(action: string, body: object) {
  const { handleApi } = await import('./api-handlers.js')
  return await handleApi(requestFromBody(body), action, config)
}

function passwordRequest(): IncomingMessage {
  return requestWithCookie({ password: 'correct-password' }, loginCookie())
}

function loginCookie(): string {
  return serializeLoginState(
    {
      authRequest: 'V2_370134305323614212',
      loginName: 'huanamasi123@gmail.com',
      sessionId: 'session-id',
      sessionToken: 'identified-session-token',
    },
    config,
  )
}

function requestWithCookie(body: object, cookieValue: string): IncomingMessage {
  const request = requestFromBody(body)
  request.headers = { cookie: `${LOGIN_SESSION_COOKIE}=${cookieValue}` }
  return request
}

function requestFromBody(body: object): IncomingMessage {
  const request = Readable.from([JSON.stringify(body)]) as IncomingMessage
  request.headers = {}
  return request
}
