import { beforeEach, describe, expect, it } from 'vitest'
import { createNonce, createPkcePair, createState } from '../pkce'

describe('PKCE helpers', () => {
  beforeEach(() => {
    // Web Crypto sudah tersedia di jsdom modern dengan subtle.digest.
  })

  it('createState produces opaque URL-safe string ≥ 22 chars', () => {
    const state = createState()
    expect(state).toMatch(/^[A-Za-z0-9\-_]+$/)
    expect(state.length).toBeGreaterThanOrEqual(22)
  })

  it('createNonce yields a different value each call', () => {
    expect(createNonce()).not.toBe(createNonce())
  })

  it('createPkcePair returns S256 challenge derived from verifier', async () => {
    const pair = await createPkcePair()

    expect(pair.code_challenge_method).toBe('S256')
    expect(pair.code_verifier).toMatch(/^[A-Za-z0-9\-_]+$/)
    expect(pair.code_verifier.length).toBeGreaterThanOrEqual(43)
    expect(pair.code_challenge).toMatch(/^[A-Za-z0-9\-_]+$/)
    expect(pair.code_challenge).not.toBe(pair.code_verifier)

    // Deterministic: challenge yang sama untuk verifier yang sama (re-hash manual).
    const encoder = new TextEncoder()
    const expectedDigest = await crypto.subtle.digest('SHA-256', encoder.encode(pair.code_verifier))
    const expected = btoa(String.fromCharCode(...new Uint8Array(expectedDigest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/u, '')
    expect(pair.code_challenge).toBe(expected)
  })
})
