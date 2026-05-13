import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __clearJwksCacheForTests, fetchJwks, JwksFetchError } from '../jwks'

const JWKS_URL = 'https://sso.example.com/.well-known/jwks.json'

const SAMPLE_KEYS = {
  keys: [
    {
      kty: 'EC',
      crv: 'P-256',
      x: 'dGzfw6DgPaMK1wKN4qy2wD45dUc_Fw4nlfHCsSYNPoQ',
      y: 'kZ4Hjk6_48BfQksQFCQZvAPOhKFB4SVwGyJ3qMgjX2c',
      kid: 'sso-main-key',
      alg: 'ES256',
      use: 'sig',
    },
  ],
}

describe('fetchJwks', () => {
  beforeEach(() => {
    __clearJwksCacheForTests()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches JWKS and returns the keys array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(SAMPLE_KEYS), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ETag: '"abc123"' },
        }),
      ),
    )

    const keys = await fetchJwks(JWKS_URL)
    expect(keys).toHaveLength(1)
    expect(keys[0]?.kid).toBe('sso-main-key')
  })

  it('returns cached keys on second call within TTL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_KEYS), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ETag: '"abc123"' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await fetchJwks(JWKS_URL)
    await fetchJwks(JWKS_URL)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws JwksFetchError on non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('boom', { status: 503 })),
    )

    await expect(fetchJwks(JWKS_URL)).rejects.toThrow(JwksFetchError)
  })

  it('throws JwksFetchError on empty keys array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ keys: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    await expect(fetchJwks(JWKS_URL)).rejects.toThrow(/does not contain/i)
  })

  it('throws JwksFetchError on malformed JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('not json', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    await expect(fetchJwks(JWKS_URL)).rejects.toThrow(/valid JSON/i)
  })

  it('throws JwksFetchError on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    await expect(fetchJwks(JWKS_URL)).rejects.toThrow(JwksFetchError)
  })
})
