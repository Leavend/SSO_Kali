import { describe, expect, it, vi } from 'vitest'
import { oidcFoundationApi } from '../oidcFoundation.api'

describe('oidcFoundationApi', () => {
  it('loads the snapshot through the same-origin admin BFF', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ checked_at: '2026-05-26T10:00:00+00:00' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await oidcFoundationApi.getSnapshot()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/oidc-foundation',
      expect.objectContaining({ credentials: 'include' }),
    )
  })
})
