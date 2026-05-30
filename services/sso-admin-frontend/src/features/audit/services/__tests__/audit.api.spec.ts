import { describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/lib/api/api-client'
import { auditApi } from '../audit.api'

vi.mock('@/lib/api/api-client', () => ({
  apiClient: {
    get: vi.fn<() => Promise<unknown>>(),
    getBlob: vi.fn<() => Promise<unknown>>(),
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
      '/api/admin/data-subject-requests?status=submitted',
    )
    expect(apiClient.get).toHaveBeenNthCalledWith(
      5,
      '/api/admin/audit/authentication-events?event_type=refresh_token_reuse_detected&limit=10',
    )
    expect(apiClient.get).toHaveBeenNthCalledWith(
      6,
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

  it('serializes full audit event filters', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({})

    await auditApi.listEvents({
      action: 'admin.user.lock',
      outcome: 'denied',
      taxonomy: 'user_lifecycle',
      admin_subject_id: 'admin-1',
      from: '2026-05-01',
      to: '2026-05-30',
      cursor: 'cursor-audit-2',
      limit: 50,
    })

    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/admin/audit/events?action=admin.user.lock&outcome=denied&taxonomy=user_lifecycle&admin_subject_id=admin-1&from=2026-05-01&to=2026-05-30&cursor=cursor-audit-2&limit=50',
    )
  })

  it('serializes authentication audit correlation filters', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({})

    await auditApi.listAuthenticationEvents({
      request_id: 'req-auth-1',
      subject_id: 'sub-target',
      session_id: 'sid-123',
      event_type: 'login_failed',
      outcome: 'failed',
      from: '2026-05-01',
      to: '2026-05-30',
      cursor: 'cursor-auth-2',
      limit: 25,
    })

    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/admin/audit/authentication-events?request_id=req-auth-1&subject_id=sub-target&session_id=sid-123&event_type=login_failed&outcome=failed&from=2026-05-01&to=2026-05-30&cursor=cursor-auth-2&limit=25',
    )
  })

  it('downloads audit export as a blob through GET /api/admin/audit/export', async () => {
    vi.mocked(apiClient.getBlob).mockResolvedValue({
      blob: new Blob(['action,outcome\n'], { type: 'text/csv' }),
      filename: 'audit-export.csv',
    })

    await auditApi.exportEvents({ format: 'csv', outcome: 'failed', from: '2026-01-01' })

    expect(apiClient.getBlob).toHaveBeenCalledWith(
      '/api/admin/audit/export?format=csv&outcome=failed&from=2026-01-01',
    )
  })

  it('downloads a compliance evidence pack through GET /api/admin/compliance/evidence-pack', async () => {
    vi.mocked(apiClient.getBlob).mockResolvedValue({
      blob: new Blob(['pack'], { type: 'application/zip' }),
      filename: 'compliance-evidence-pack.zip',
    })

    await auditApi.generateEvidencePack({
      from: '2026-01-01',
      to: '2026-01-31',
      correlation_id: 'INC-42',
      format: 'zip',
    })

    expect(apiClient.getBlob).toHaveBeenCalledWith(
      '/api/admin/compliance/evidence-pack?from=2026-01-01&to=2026-01-31&correlation_id=INC-42&format=zip',
    )
  })
})
