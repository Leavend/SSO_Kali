import { describe, expect, it, beforeEach } from 'vitest'
import { decryptSession, encryptSession } from '../server/session-crypto'

describe('session crypto', () => {
  beforeEach(() => {
    process.env.SESSION_ENCRYPTION_SECRET = 'test-secret-with-more-than-32-characters'
  })

  it('round-trips encrypted session payloads', () => {
    const ciphertext = encryptSession(JSON.stringify({ sub: 'admin-1' }))

    expect(ciphertext).not.toContain('admin-1')
    expect(decryptSession(ciphertext)).toBe(JSON.stringify({ sub: 'admin-1' }))
  })

  it('returns null for tampered payloads', () => {
    const ciphertext = encryptSession('payload')

    expect(decryptSession(`${ciphertext}x`)).toBeNull()
  })
})
