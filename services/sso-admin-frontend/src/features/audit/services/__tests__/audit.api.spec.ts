import { describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/lib/api/api-client'
import { auditApi } from '../audit.api'

vi.mock('@/lib/api/api-client', () => ({
  apiClient: {
    get: vi.fn<() => Promise<unknown>>(),
    post: vi.fn<() => Promise<unknown>>(),
  },
}))

describe('auditApi', () => {
  it('uses explicit admin BFF routes for audit and DSR compliance', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({})
    vi.mocked(apiClient.post).mockResolvedValue({})

    await auditApi.listEvents({ outcome: 'denied', limit: 25 })
    await auditApi.showEvent('AUD01')
    await auditApi.getIntegrity()
    await auditApi.exportEvents({ format: 'csv', outcome: 'failed' })
    await auditApi.listDataSubjectRequests({ status: 'submitted' })
    await auditApi.listAuthenticationEvents({
      event_type: 'refresh_token_reuse_detected',
      limit: 10,
    })
    await auditApi.showAuthenticationEvent('AUTH01')
    await auditApi.reviewDataSubjectRequest('01HX7S8Y9ZABCDEF1234567890', {
      decision: 'approved',
      notes: 'Verified evidence',
    })
    await auditApi.fulfillDataSubjectRequest('01HX7S8Y9ZABCDEF1234567890', { dry_run: true })

    expect(apiClient.get).toHaveBeenNthCalledWith(
      1,
      '/api/admin/audit/events?outcome=denied&limit=25',
    )
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/api/admin/audit/events/AUD01')
    expect(apiClient.get).toHaveBeenNthCalledWith(3, '/api/admin/audit/integrity')
    expect(apiClient.get).toHaveBeenNthCalledWith(
      4,
      '/api/admin/audit/export?format=csv&outcome=failed',
    )
    expect(apiClient.get).toHaveBeenNthCalledWith(
      5,
      '/api/admin/data-subject-requests?status=submitted',
    )
    expect(apiClient.get).toHaveBeenNthCalledWith(
      6,
      '/api/admin/audit/authentication-events?event_type=refresh_token_reuse_detected&limit=10',
    )
    expect(apiClient.get).toHaveBeenNthCalledWith(
      7,
      '/api/admin/audit/authentication-events/AUTH01',
    )
    expect(apiClient.post).toHaveBeenNthCalledWith(
      1,
      '/api/admin/data-subject-requests/01HX7S8Y9ZABCDEF1234567890/review',
      { decision: 'approved', notes: 'Verified evidence' },
    )
    expect(apiClient.post).toHaveBeenNthCalledWith(
      2,
      '/api/admin/data-subject-requests/01HX7S8Y9ZABCDEF1234567890/fulfill',
      { dry_run: true },
    )
  })
})
