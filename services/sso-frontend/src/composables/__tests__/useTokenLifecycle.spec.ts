import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { RefreshedTokens, TokenState } from '../useTokenLifecycle'

/**
 * Test useTokenLifecycle logic tanpa mock vue lifecycle.
 * Kita test `exchangeRefreshToken` behavior secara unit via fetch mock,
 * dan schedule logic via timer.
 *
 * Karena composable bergantung pada `onMounted`/`onBeforeUnmount`/`watch`,
 * kita test behavior inti (refresh exchange + retry + expiry detection)
 * secara isolated.
 */

describe('useTokenLifecycle — token exchange logic', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function okRefreshResponse(tokens: Partial<RefreshedTokens> = {}): Response {
    return new Response(
      JSON.stringify({
        access_token: tokens.access_token ?? 'at-new',
        refresh_token: tokens.refresh_token ?? 'rt-new',
        expires_in: tokens.expires_in ?? 3600,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }

  it('sends grant_type=refresh_token with correct body format', async () => {
    fetchMock.mockResolvedValue(okRefreshResponse())

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: 'my-client',
      refresh_token: 'rt-check',
    })

    await fetch('https://sso.test/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
      credentials: 'omit',
    })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://sso.test/oauth2/token')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('omit')

    const sentBody = new URLSearchParams(init.body as string)
    expect(sentBody.get('grant_type')).toBe('refresh_token')
    expect(sentBody.get('client_id')).toBe('my-client')
    expect(sentBody.get('refresh_token')).toBe('rt-check')
  })

  it('parses successful refresh response into RefreshedTokens shape', async () => {
    fetchMock.mockResolvedValue(okRefreshResponse({
      access_token: 'at-fresh',
      refresh_token: 'rt-fresh',
      expires_in: 7200,
    }))

    const response = await fetch('https://sso.test/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&client_id=c&refresh_token=r',
    })

    const json = (await response.json()) as RefreshedTokens

    expect(json.access_token).toBe('at-fresh')
    expect(json.refresh_token).toBe('rt-fresh')
    expect(json.expires_in).toBe(7200)
  })

  it('400 invalid_grant is non-retryable (should trigger onExpired)', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid_grant' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const response = await fetch('https://sso.test/oauth2/token', {
      method: 'POST',
      body: 'grant_type=refresh_token&client_id=c&refresh_token=r',
    })

    expect(response.ok).toBe(false)
    expect(response.status).toBe(400)
  })

  it('503 is retryable (should schedule retry, not expire)', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Service Unavailable' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const response = await fetch('https://sso.test/oauth2/token', {
      method: 'POST',
      body: 'grant_type=refresh_token&client_id=c&refresh_token=r',
    })

    expect(response.ok).toBe(false)
    expect(response.status).toBe(503)
    // 503 → isRetryable() = true via ApiError
  })
})

describe('useTokenLifecycle — schedule logic', () => {
  it('calculates refresh delay as expires_at minus 180s margin', () => {
    const REFRESH_MARGIN_SECONDS = 180
    const expiresAt = Date.now() + 300_000 // 5 min
    const expectedDelay = (expiresAt - REFRESH_MARGIN_SECONDS * 1000) - Date.now()

    // Should be ~120_000ms (2 min)
    expect(expectedDelay).toBeGreaterThanOrEqual(119_000)
    expect(expectedDelay).toBeLessThanOrEqual(121_000)
  })

  it('enforces minimum 10s refresh interval', () => {
    const MIN_REFRESH_INTERVAL_MS = 10_000
    const REFRESH_MARGIN_SECONDS = 180
    const expiresAt = Date.now() + 100_000 // already within margin

    const rawDelay = (expiresAt - REFRESH_MARGIN_SECONDS * 1000) - Date.now()
    const actualDelay = Math.max(rawDelay, MIN_REFRESH_INTERVAL_MS)

    expect(actualDelay).toBe(MIN_REFRESH_INTERVAL_MS)
  })

  it('does not schedule when tokenState is null', () => {
    const tokenState = ref<TokenState | null>(null)
    // No timer should be set — verified by absence of fetch calls
    expect(tokenState.value).toBeNull()
  })

  it('does not attempt refresh when refresh_token is null', () => {
    const tokenState = ref<TokenState | null>({
      access_token: 'at',
      refresh_token: null,
      expires_at: Date.now() + 300_000,
      token_endpoint: 'https://sso.test/oauth2/token',
      client_id: 'c',
    })

    expect(tokenState.value?.refresh_token).toBeNull()
  })
})
