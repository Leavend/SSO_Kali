import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/lib/api/api-client'
import { authAuditApi } from '@/services/auth-audit.api'

afterEach(() => vi.restoreAllMocks())

describe('authAuditApi.listEvents', () => {
  it('GETs the bare path with no filters', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ events: [] } as never)
    await authAuditApi.listEvents()
    expect(get).toHaveBeenCalledWith('/api/admin/audit/authentication-events')
  })

  it('GETs with the serialized non-blank filters', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ events: [] } as never)
    await authAuditApi.listEvents({ limit: 50, outcome: 'failed', subject_id: '' })
    const url = get.mock.calls[0]?.[0] as string
    expect(url.startsWith('/api/admin/audit/authentication-events?')).toBe(true)
    expect(url).toContain('limit=50')
    expect(url).toContain('outcome=failed')
    expect(url).not.toContain('subject_id')
  })

  it('passes the response through unchanged', async () => {
    const payload = { events: [{ event_id: 'x' }], pagination: { has_more: false } }
    vi.spyOn(apiClient, 'get').mockResolvedValue(payload as never)
    expect(await authAuditApi.listEvents()).toBe(payload)
  })
})
