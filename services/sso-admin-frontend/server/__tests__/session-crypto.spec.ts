// @vitest-environment node
// NOTE: the `// @vitest-environment node` pragma above is non-functional —
// defineVitestConfig auto-routes *.spec.ts files to the jsdom project and
// overrides per-file environment pragmas. This comment is kept for intent
// documentation only. node:crypto is available in the jsdom project so AES-
// 256-GCM operations work correctly without a node environment override.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('admin BFF session crypto', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('SESSION_ENCRYPTION_SECRET', 'test-admin-session-secret-32-bytes-long')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('round-trips plaintext through AES-256-GCM', async () => {
    const { encryptSession, decryptSession } = await import('../utils/session-crypto')
    const plaintext = JSON.stringify({ state: 's', nonce: 'n', codeVerifier: 'v' })
    const ciphertext = encryptSession(plaintext)

    expect(ciphertext).not.toContain(plaintext)
    expect(decryptSession(ciphertext)).toBe(plaintext)
  })

  it('returns null when the ciphertext authentication tag is tampered', async () => {
    const { encryptSession, decryptSession } = await import('../utils/session-crypto')
    const ciphertext = encryptSession('top-secret')
    const raw = Buffer.from(ciphertext, 'base64url')
    raw[raw.length - 1] = raw[raw.length - 1]! ^ 0xff
    expect(decryptSession(raw.toString('base64url'))).toBeNull()
  })

  it('returns null for a ciphertext shorter than the IV + auth tag framing', async () => {
    const { decryptSession } = await import('../utils/session-crypto')
    expect(decryptSession('AAAA')).toBeNull()
  })
})
