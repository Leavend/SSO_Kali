import { describe, expect, it, vi } from 'vitest'

async function loadCryptoModule() {
  vi.resetModules()
  return import('../server/session-crypto')
}

describe('session crypto runtime fallback', () => {
  it('does not throw when SESSION_ENCRYPTION_SECRET is missing', async () => {
    vi.stubEnv('SESSION_ENCRYPTION_SECRET', '')
    vi.stubEnv('VITE_ADMIN_BASE_URL', 'https://sso.timeh.my.id')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { encryptSession, decryptSession } = await loadCryptoModule()

    const encrypted = encryptSession('{"status":"ok"}')

    expect(decryptSession(encrypted)).toBe('{"status":"ok"}')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('SESSION_ENCRYPTION_SECRET is not configured'))

    vi.unstubAllEnvs()
    warn.mockRestore()
  })
})
