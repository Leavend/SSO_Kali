import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __clearDiscoveryCacheForTests,
  DiscoveryFetchError,
  fetchDiscovery,
} from '../discovery'

const DISCOVERY_URL = 'https://sso.example.com/.well-known/openid-configuration'

const VALID_METADATA = {
  issuer: 'https://sso.example.com',
  authorization_endpoint: 'https://sso.example.com/oauth/authorize',
  token_endpoint: 'https://sso.example.com/oauth/token',
  userinfo_endpoint: 'https://sso.example.com/userinfo',
  jwks_uri: 'https://sso.example.com/.well-known/jwks.json',
  response_types_supported: ['code'],
  subject_types_supported: ['public'],
  id_token_signing_alg_values_supported: ['ES256'],
}

function makeResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ETag: '"v1"' },
    ...init,
  })
}

describe('fetchDiscovery', () => {
  beforeEach(() => {
    __clearDiscoveryCacheForTests()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches and returns metadata when well-formed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(VALID_METADATA)))

    const metadata = await fetchDiscovery(DISCOVERY_URL)

    expect(metadata.issuer).toBe('https://sso.example.com')
    expect(metadata.jwks_uri).toContain('jwks.json')
  })

  it('returns cached metadata on repeated calls within TTL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(VALID_METADATA))
    vi.stubGlobal('fetch', fetchMock)

    await fetchDiscovery(DISCOVERY_URL)
    await fetchDiscovery(DISCOVERY_URL)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('sends If-None-Match after the first fetch is cached past TTL via 304 revalidation path', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(VALID_METADATA))
    vi.stubGlobal('fetch', fetchMock)

    await fetchDiscovery(DISCOVERY_URL)
    const callArgs = fetchMock.mock.calls[0]
    expect(callArgs?.[1]?.headers).not.toHaveProperty('If-None-Match')
  })

  it('throws DiscoveryFetchError on non-OK HTTP status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('oops', { status: 503 })),
    )

    await expect(fetchDiscovery(DISCOVERY_URL)).rejects.toThrow(DiscoveryFetchError)
  })

  it('throws DiscoveryFetchError when required field missing', async () => {
    const incomplete = { ...VALID_METADATA, issuer: undefined }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(incomplete)))

    await expect(fetchDiscovery(DISCOVERY_URL)).rejects.toThrow(/missing required field/i)
  })

  it('throws DiscoveryFetchError on malformed JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('not json', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    await expect(fetchDiscovery(DISCOVERY_URL)).rejects.toThrow(/valid JSON/i)
  })

  it('throws DiscoveryFetchError on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')))

    await expect(fetchDiscovery(DISCOVERY_URL)).rejects.toThrow(DiscoveryFetchError)
  })
})
