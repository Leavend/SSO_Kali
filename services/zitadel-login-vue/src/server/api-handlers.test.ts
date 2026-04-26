import { Readable } from 'node:stream'
import type { IncomingMessage } from 'node:http'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { RuntimeConfig } from './config.js'
import { LOGIN_SESSION_COOKIE, serializeLoginState } from './cookies.js'

const mocks = vi.hoisted(() => ({
  finalizeAuthRequest: vi.fn(),
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
  createSession: vi.fn(),
  finalizeAuthRequest: mocks.finalizeAuthRequest,
  updatePassword: mocks.updatePassword,
  updateTotp: mocks.updateTotp,
}))

const config: RuntimeConfig = {
  apiUrl: 'http://zitadel-api:8080',
  cookieSecret: 'test-zitadel-login-vue-cookie-secret-32',
  instanceHost: 'id.dev-sso.timeh.my.id',
  port: 3010,
  publicBasePath: '/ui/v2/login-vue',
  publicHost: 'id.dev-sso.timeh.my.id',
  requireTotpAfterPassword: true,
  secureCookies: true,
  token: 'service-token',
}

describe('login API flow', () => {
  beforeEach(() => {
    mocks.finalizeAuthRequest.mockReset()
    mocks.updatePassword.mockResolvedValue('password-session-token')
  })

  it('keeps OIDC auth requests on the OTP step after password verification', async () => {
    const response = await handlePasswordStep()
    const payload = JSON.parse(String(response.body)) as { nextStep?: string }

    expect(response.status).toBe(200)
    expect(payload.nextStep).toBe('otp')
    expect(mocks.finalizeAuthRequest).not.toHaveBeenCalled()
    expect(String(response.headers['set-cookie'])).toContain(LOGIN_SESSION_COOKIE)
  })
})

async function handlePasswordStep() {
  const { handleApi } = await import('./api-handlers.js')
  return await handleApi(passwordRequest(), '/session/password', config)
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
  const request = Readable.from([JSON.stringify(body)]) as IncomingMessage
  request.headers = { cookie: `${LOGIN_SESSION_COOKIE}=${cookieValue}` }
  return request
}
