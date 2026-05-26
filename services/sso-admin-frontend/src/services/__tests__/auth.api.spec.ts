import { describe, expect, it, vi } from 'vitest'
import { authApi } from '../auth.api'

describe('authApi', () => {
  it('loads the admin principal through the same-origin admin BFF', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ principal: { subject_id: 'sub_admin' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await authApi.getPrincipal()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/me',
      expect.objectContaining({ credentials: 'include' }),
    )
  })
})
