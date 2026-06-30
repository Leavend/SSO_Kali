import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/lib/api/api-client'
import { oidcFoundationApi } from '@/services/oidc-foundation.api'

afterEach(() => vi.restoreAllMocks())

describe('oidcFoundationApi.getSnapshot', () => {
  it('GETs the foundation snapshot path', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ checked_at: 'x' } as never)
    await oidcFoundationApi.getSnapshot()
    expect(get).toHaveBeenCalledWith('/api/admin/oidc-foundation')
  })

  it('passes the snapshot through unchanged', async () => {
    const snapshot = { checked_at: 'x', correlation_id: null }
    vi.spyOn(apiClient, 'get').mockResolvedValue(snapshot as never)
    expect(await oidcFoundationApi.getSnapshot()).toBe(snapshot)
  })
})
