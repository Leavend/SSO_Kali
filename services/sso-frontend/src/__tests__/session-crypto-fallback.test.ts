import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadCryptoModule() {
  vi.resetModules()
  return import('../server/session-crypto')
}

describe('session crypto runtime fallback', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('does not throw when SESSION_ENCRYPTION_SECRET is missing outside production', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('SESSION_ENCRYPTION_SECRET', '')
    vi.stubEnv('VITE_SSO_FRONTEND_BASE_URL', 'https://sso.timeh.my.id')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { encryptSession, decryptSession } = await loadCryptoModule()

    const encrypted = encryptSession('{"status":"ok"}')

    expect(decryptSession(encrypted)).toBe('{"status":"ok"}')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('SESSION_ENCRYPTION_SECRET is not configured'))
  })

  it('fails closed in production when SESSION_ENCRYPTION_SECRET is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SESSION_ENCRYPTION_SECRET', '')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { encryptSession } = await loadCryptoModule()

    expect(() => encryptSession('{"status":"ok"}')).toThrow('SESSION_ENCRYPTION_SECRET must be configured.')
    expect(warn).not.toHaveBeenCalled()
  })
})
